# Self-host Postgres for liminal-calendar on chora-node

One-time setup. Copy these files to chora-node and run the commands in
order. All commands run on **chora-node** (your local box), not on
flur_workspace.

## Files in this directory

- `docker-compose.snippet.yml` — append to your existing
  `D:\projects\docker-compose.yml` under `services:`.
- `init/00-enable-ssl.sh` — runs once on first container start to
  generate a self-signed TLS cert and rewrite `postgresql.conf` /
  `pg_hba.conf`. Mounted into the container at
  `/docker-entrypoint-initdb.d/00-enable-ssl.sh`.

## Step 1 — copy files to chora-node

On chora-node, in `D:\projects\`:

```cmd
mkdir postgres-calendar
mkdir postgres-calendar\init
:: copy the two files from this repo into:
::   D:\projects\postgres-calendar\init\00-enable-ssl.sh
:: and append docker-compose.snippet.yml content to D:\projects\docker-compose.yml
```

## Step 2 — generate a strong password

```cmd
:: Pick any 40+ char random string. PowerShell:
powershell -c "[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36)) -replace '[+/=]',''"
```

Save the output — you'll paste it into Vercel env in Step 5.

## Step 3 — set the password in chora-node's `.env`

In `D:\projects\.env`:

```
CALENDAR_DB_PASSWORD=<paste-the-password-from-step-2>
```

## Step 4 — start the Postgres container

```cmd
cd D:\projects
docker compose up -d postgres-calendar
docker compose logs --tail=30 postgres-calendar
```

You should see `[init-ssl] SSL configuration applied.` followed by
`database system is ready to accept connections`.

Test it locally on chora-node:

```cmd
docker exec -it postgres-calendar psql -U calendar -d calendar -c "SHOW ssl;"
:: Should print: ssl | on
```

## Step 5 — Cloudflare DNS

In Cloudflare DNS for `liminalcalendar.com` (or `castalia.one` — pick a
subdomain you control), add an **A record** with proxy status **DNS
only** (gray cloud, NOT orange):

```
Type: A
Name: db
Target: <chora-node's public IP>
Proxy: DNS only
```

Wait ~30s for DNS propagation. Verify from any other machine:

```bash
nslookup db.liminalcalendar.com
```

## Step 6 — Firewall

On chora-node's router/firewall, port-forward `5432/tcp` from the public
IP to chora-node. If chora-node already has direct public exposure
(it's the host running other public services), just allow inbound
`5432/tcp`:

```cmd
:: Windows firewall — open 5432 inbound
netsh advfirewall firewall add rule name="Postgres Calendar" dir=in action=allow protocol=TCP localport=5432
```

## Step 7 — update Vercel env

Run from your **flur_workspace** machine (where this repo lives):

```bash
cd packages/liminal-calendar

# Add the new DATABASE_URL — replace <password> with the value from Step 2.
echo "postgresql://calendar:<password>@db.liminalcalendar.com:5432/calendar?sslmode=require" | \
  npx vercel env add DATABASE_URL production
```

## Step 8 — bootstrap the schema

After the Vercel deploy lands (next push triggers it), bootstrap the
empty database with:

```bash
curl -X POST https://liminalcalendar.com/api/db-migrate \
  -H "Authorization: Bearer $CRON_SECRET"
```

(`CRON_SECRET` is already in Vercel env. You can grab it with
`npx vercel env pull` if needed.)

## Step 9 — verify

```bash
curl -s https://liminalcalendar.com/api/events | head -c 200
# Expect: [] (empty array — DB is up but has no events yet)
```

Then in browser: visit https://liminalcalendar.com/, sign in via
Castalia or email/Google, create a test event, confirm it appears on
the grid.

## Step 10 — clean up the old Neon integration (after verifying)

```bash
npx vercel integration list
# find `neon-celeste-sail` and uninstall via the Vercel dashboard
```

## Resilience (built into this setup)

The `docker-compose.snippet.yml` ships **two** services, not one:

1. `postgres-calendar` — the database itself (`restart: unless-stopped`,
   healthcheck every 30s, memory cap 1GB).
2. `postgres-calendar-backup` — `prodrigestivill/postgres-backup-local`
   running `pg_dump` on a `@daily` schedule, writing custom-format
   compressed dumps into `./postgres-calendar/backups/`. Retention:
   14 daily, 8 weekly, 12 monthly snapshots.

Backups land at:

```
D:\projects\postgres-calendar\backups\
  daily\
  weekly\
  monthly\
  last\          ← always the most recent
```

### Offsite sync to R2 (recommended)

Local backups protect against bad migrations and accidental drops, but
not against chora-node disk failure or fire. Sync to Cloudflare R2
(or any S3-compatible store):

1. Install rclone on chora-node: https://rclone.org/install/
2. Configure an `r2` remote: `rclone config` → pick `s3` → `Cloudflare R2`
3. Create an R2 bucket: `calendar-backups`
4. Copy `backup-to-r2.sh` from this directory to chora-node
5. Schedule it daily at 03:00 via Windows Task Scheduler:
   ```cmd
   schtasks /create /tn "CalendarBackupToR2" /tr "C:\Program Files\Git\bin\bash.exe D:\projects\postgres-calendar\backup-to-r2.sh" /sc daily /st 03:00
   ```
6. Verify the first run lands a file in R2 — check `rclone ls r2:calendar-backups/`.

### Restore drill

Practice this before you need it:

```cmd
:: List available backups
docker exec postgres-calendar-backup ls /backups/daily/

:: Restore from a specific snapshot (use with care — drops + reloads schema)
docker exec -i postgres-calendar pg_restore \
  -U calendar -d calendar --clean --if-exists \
  < D:\projects\postgres-calendar\backups\daily\calendar-2026-05-19.sql.gz
```

### Health monitoring

`/api/health/db` on the deployed app returns 200 if the connection
works, 503 if not. Point UptimeRobot (free tier: 50 monitors, 5-minute
checks) at `https://liminalcalendar.com/api/health/db` and have it
alert via email / Slack / Telegram on failure.

### Connection failure handling in the app

The app uses `postgres-js` with `max: 1` per Vercel function invocation
and `connect_timeout: 10s`. On a transient DB blip:
- Server Components wrapped in `try/catch` (HomePage, MarketingLanding,
  /api/events) degrade to "empty state" rather than 500.
- Successful queries on the next request reconnect automatically —
  `postgres-js` handles re-establishment internally.

### What this does NOT cover

- **PITR / continuous WAL archiving**: `pg_dump` gives daily RPO. A
  transaction within the last 24h could be lost. Add WAL archiving if
  you need finer granularity (`archive_mode = on` in postgresql.conf +
  an `archive_command` that uploads each WAL segment to R2).
- **Standby replication**: single-node. For HA, add a streaming
  replica on a second machine and a failover script. Probably overkill
  for this workload.
- **Schema migration safety**: nothing stops an `ALTER TABLE … DROP
  COLUMN` from running against prod. Practice migrations against a
  restored backup in a sidecar `postgres-calendar-staging` container.

## What you lose vs. Neon

- **Branching**: no preview-deploy branches. Previews will share prod DB.
- **Auto-scale**: chora-node is the ceiling; sudden traffic spikes hit your home connection.
- **PITR**: nightly backup is coarser than Neon's point-in-time recovery.

All acceptable for a community calendar with low traffic.
