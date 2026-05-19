#!/bin/sh
# Runs once on first container start, after initdb completes but before the
# server is fully ready. Sets up SSL using a self-signed cert + reloads
# postgresql.conf so the running server picks up the changes.

set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"

# Generate self-signed cert + key if not present.
if [ ! -f "$PGDATA/server.key" ]; then
  echo "[init-ssl] Generating self-signed cert for postgres..."
  openssl req -new -x509 -days 3650 -nodes -text \
    -out "$PGDATA/server.crt" \
    -keyout "$PGDATA/server.key" \
    -subj "/CN=postgres-calendar"
  chmod 600 "$PGDATA/server.key"
  chown postgres:postgres "$PGDATA/server.key" "$PGDATA/server.crt"
fi

# Enable SSL in postgresql.conf — idempotent append.
if ! grep -q "^ssl = on" "$PGDATA/postgresql.conf" 2>/dev/null; then
  cat >> "$PGDATA/postgresql.conf" <<EOF

# === Added by 00-enable-ssl.sh ===
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
listen_addresses = '*'
# === end ===
EOF
fi

# Allow SSL connections from any IP — pg_hba.conf uses CIDR.
# The postgres docker image's default pg_hba allows only host (non-SSL).
# We append a hostssl rule and remove the open `host all all all md5` line.
if ! grep -q "^hostssl all all 0.0.0.0/0" "$PGDATA/pg_hba.conf" 2>/dev/null; then
  echo "" >> "$PGDATA/pg_hba.conf"
  echo "# === Added by 00-enable-ssl.sh: SSL-only connections from any IP ===" >> "$PGDATA/pg_hba.conf"
  echo "hostssl all all 0.0.0.0/0 scram-sha-256" >> "$PGDATA/pg_hba.conf"
  echo "hostssl all all ::/0       scram-sha-256" >> "$PGDATA/pg_hba.conf"
fi

echo "[init-ssl] SSL configuration applied. Postgres will start with TLS enabled."
