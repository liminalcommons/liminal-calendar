# Clerk Integration — Handoff

**Status (2026-04-27):** Functionally complete on the calendar `main` branch. 24 commits since `1de717c` (S1). Tests: 32 suites / 293 tests / 0 fail. Pending owner-side activation steps below.

The integration adds Clerk as a SECOND authentication provider beside the existing Hylo OAuth gateway. Existing Hylo users see no change. New users can sign up via Clerk (email magic-link / Google / Apple / Facebook) and access the same calendar features.

---

## What works today (post-deploy + activation)

- **Hylo users**: byte-identical sign-in via `auth.castalia.one` gateway. RSVPs, profile, reminders, calendar — all unchanged.
- **New users via Clerk**: sign up at `/sign-up`, get a `members` row provisioned via `user.created` webhook, can RSVP, opt into newsletter, get reminders.
- **Email-verified auto-merge**: a Clerk user whose verified email matches an existing Hylo Member's email is auto-merged into that Member row (single profile across providers).
- **Clerk-side updates propagate**: `user.updated` webhook UPDATEs name/email/image on our `members` row, preserving role + feedToken.
- **Manual linking**: any user with BOTH Hylo and Clerk sessions can click "Link Hylo + Clerk accounts" on `/profile` to merge identities (when auto-merge didn't trigger, e.g. different emails).
- **DB-layer invariant**: `chk_members_identity` CHECK constraint enforces `hylo_id IS NOT NULL OR clerk_id IS NOT NULL` on every Member row.

---

## Owner activation checklist (required before live use)

Run these in order:

### 1. Configure Clerk dashboard (production)

Go to `dashboard.clerk.com → Configure → Webhooks → Add endpoint`:

- **Endpoint URL**: `https://calendar.castalia.one/api/webhooks/clerk`
- **Subscribe to events**: `user.created`, `user.updated`
- Copy the signing secret (starts with `whsec_...`).

Then `dashboard.clerk.com → User & authentication → User & authentication`:

- **Email**: ON, with verification code (Recommended). Magic link disabled.
- **Phone**: OFF (both sign-up + sign-in toggles). Pro features.
- **SSO connections**: Apple, Facebook, Google enabled. Production needs custom OAuth credentials per provider (dev uses Clerk's shared credentials).

Full state recorded in `docs/clerk-config.md`.

### 2. Set production env vars

In Vercel (or wherever production deploys live):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...    # from Clerk dashboard production instance
CLERK_SECRET_KEY=sk_live_...                      # from Clerk dashboard production instance
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...            # from step 1
```

The dev keys in `.env.local` are different — production needs its own Clerk instance.

### 3. Run the DB migration

The integration adds:
- `members.clerk_id TEXT` (nullable, partial unique index)
- `members.hylo_id` becomes nullable
- `chk_members_identity` CHECK constraint
- `newsletter_subscribers` table

Idempotent — safe to re-run. Trigger via the existing migrate endpoint:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://calendar.castalia.one/api/db-migrate
```

Run on PBE first (per the PBE-only deploy policy memorialized in CLAUDE.md), verify, then prod.

### 4. Smoke-test end-to-end (post-deploy)

- Sign up via `/sign-up` with an email NOT in the Hylo `members` table → should provision a Clerk-only row.
- Check `/profile` works (uses `getCurrentMember`).
- RSVP to an event with the newsletter checkbox → check `newsletter_subscribers` row created.
- Existing Hylo user sign-in flow → unchanged.

### 5. Rotate the leaked development secret

The Clerk **dev** secret key (`sk_test_…`) was pasted in chat once during the integration session. Rotate via `dashboard.clerk.com → API keys → Create new key → delete old`. Only affects dev — production uses separate keys.

---

## How users invoke the linking flow

A user might end up with separate Hylo and Clerk Members if:
- They signed up with different emails on each provider, OR
- Their Clerk email was unverified at sign-up (auto-merge gate requires verified)

To link manually:

1. Sign in via Hylo (the calendar's primary path — click NavBar Sign in → `/welcome` → "Continue with Liminal Commons (Hylo)").
2. In a separate flow, also sign in via Clerk (visit `/sign-in` directly while still on the Hylo session).
3. Navigate to `/profile`.
4. Click **"Link Hylo + Clerk accounts"** in the Account Linking section.
5. The button calls `POST /api/account/link-clerk`. Possible outcomes:
   - **already_linked**: nothing to do; both sessions resolve to the same Member.
   - **clerk_attached** / **hylo_attached**: the missing identity is now attached.
   - **needs_both_sessions** (401): user is missing one of the two sessions; complete the other sign-in.
   - **needs_merge** (409): both providers map to DISTINCT Member rows. Manual admin merge required (S6.3 — not yet built).

---

## Deferred items + recommendations

### High-priority (operational)

- **`.env.local.example` real-secret leak**: a separate file (`.env.local.example`, NOT `.env.example`) is tracked in git and contains real-looking `AUTH_SECRET` + `HYLO_CLIENT_SECRET` values. Pre-Clerk; not addressed by this integration. Owner should: rotate `AUTH_SECRET` on `auth.castalia.one` AND every consumer (calendar, castalia-one, commonwealth, cortex); rotate `HYLO_CLIENT_SECRET` via Hylo OAuth dashboard; scrub git history with BFG or `git filter-repo`; replace with placeholders.
- **Pre-existing maintenance WIP** uncommitted in calendar repo: `web-push` dependency + small fixes to `auth-helpers/chat-tools/recurrence/bug-report/upload`. Pre-Clerk WIP from a prior session. Decide whether to land or discard.

### Medium-priority (functionality)

- **S6.3 admin merge tool**: when `/api/account/link-clerk` returns 409 (both providers map to distinct Members), there's currently no mechanism to merge the rows. Needs an admin-only endpoint that:
  - Takes `keepMemberId` and `dropMemberId`
  - Updates `rsvps.user_id` and `notification_log.user_id` from `dropMember`'s identity to `keepMember`'s
  - Copies `clerkId` (or `hyloId`) from `dropMember` to `keepMember`
  - Deletes `dropMember`
- **`user.deleted` webhook handler**: currently ignored. Requires deletion-policy decision: delete the Member row? Soft-delete? Null out `clerkId` (would violate the CHECK constraint on Clerk-only Members)? Anonymize? No code change until policy is decided.
- **`rsvps.user_id` semantic ambiguity**: the column carries either `hyloId` or `clerkId` depending on the Member's provider. Future cleanup: add `member_id integer references members(id)` column to `rsvps`; populate on new RSVPs; backfill from existing rows. Cleaner schema; requires migration.

### Low-priority (engineering quality)

- **E2E test infrastructure**: Playwright + a seeded test database would close the gap that route-handler tests can't (real Clerk-signed webhook, real session cookies, real PG roundtrip). Mitigated for now by 32 test suites + 293 unit/component/route tests. The cron-lookup gap (`d3cab7c`) was caught by code-reading, not testing — strongest empirical argument for E2E.
- **Fire-and-forget reliability**: `addNewsletterSubscriber` is called fire-and-forget from the RSVP route. On Vercel serverless, this could be cancelled by cold-stop the moment after the 200 response. Mitigation: use `event.waitUntil(promise)` or Next.js's `unstable_after`. For an opt-in list with a unique-email constraint that dedupes on retry, drops are acceptable.

---

## Architecture pointers

| Concern | File |
|---|---|
| Clerk dashboard state record | `docs/clerk-config.md` |
| Env var documentation | `.env.example` (Clerk section) |
| Schema | `src/lib/db/schema.ts` (`members.clerkId`, `newsletter_subscribers`) |
| Migration | `src/lib/db/migrate.ts` (idempotent ALTERs + CHECK constraint) |
| Helpers | `src/lib/auth/sync-clerk-member*.ts`, `src/lib/auth/find-member-by-clerk-id.ts`, `src/lib/auth/get-current-member.ts`, `src/lib/auth/clerk-event-to-sync-input.ts` |
| Webhook | `src/app/api/webhooks/clerk/route.ts` |
| Linking | `src/app/api/account/link-clerk/route.ts`, `src/components/profile/LinkClerkButton.tsx` |
| Sign-in/sign-up routes | `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx` |
| Chooser UI | `src/components/auth/SignInChooser.tsx`, `src/app/welcome/page.tsx` |
| Tests | `src/__tests__/lib/*.test.ts`, `src/__tests__/app/*.test.ts`, `src/__tests__/components/*.test.tsx` |

---

## Commit reference

The integration spans `1de717c` (S1 Clerk infra) through `ce1bfb9` (S6.2.B linking UI). Run `git log --oneline 1de717c^..HEAD` for the full chain. Each commit body documents what changed, why, and what was deferred.
