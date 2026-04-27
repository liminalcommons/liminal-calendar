# Clerk Dashboard Configuration

Liminal Calendar uses Clerk as a second auth provider beside the existing Hylo
gateway. Clerk lives in its own dashboard and **its configuration is not in
this git repo** — this file captures the chosen state so a re-created Clerk
instance can be returned to it.

**Dev instance**: `subtle-gelding-90.clerk.accounts.dev` (the `pk_test_*` key
in `.env.local`).
**Production instance**: not yet created — required before any production
deploy. Configuration below should be mirrored.

## User & authentication

`Configure → User & authentication → User & authentication`

### Email tab
- Sign-up with email: **ON**
- Require email address: **ON**
- Verify at sign-up: **ON** (Recommended)
  - Verification methods: **Email verification code** ✓
  - Verification methods: ~~Email verification link~~ (disabled)
- Restrict changes: **OFF**
- Sign-in with email: **ON**
  - Email verification code: **ON**
  - ~~Email verification link~~ (disabled)

### Phone tab
- Sign-up with phone: **OFF**
- Sign-in with phone: **OFF**
- (SMS verification code remains visible in the dashboard but inactive when
  both above are off)

> *Why phone disabled:* the calendar's intent is to reach wider personal
> networks, and requiring a phone number is friction. Disabled in cycle 3
> of the Clerk integration loop on 2026-04-27.

### SSO connections
`Configure → User & authentication → SSO connections`

Enabled (all on shared dev credentials):
- Apple
- Facebook
- Google

> *Production note:* the dashboard explicitly warns "shared credentials" only
> work in dev. Production deployment requires custom OAuth credentials per
> provider.

## Paths

`Configure → Paths` (these match `.env.local` URL routing entries)

- Sign-in URL: `/sign-in`
- Sign-up URL: `/sign-up`

Set via `.env.local`:
```
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

## Webhooks

`Configure → Webhooks → Add endpoint`

- **Endpoint URL**: `https://calendar.castalia.one/api/webhooks/clerk`
  (dev: `http://localhost:3000/api/webhooks/clerk` via ngrok or Clerk's
  built-in dev tunneling)
- **Subscribe to events**: `user.created`
  (later: optionally `user.updated`, `user.deleted` for sync drift)
- **Signing secret**: copy from the dashboard into `.env.local` as
  `CLERK_WEBHOOK_SIGNING_SECRET`. The handler at
  `src/app/api/webhooks/clerk/route.ts` calls Clerk's `verifyWebhook`
  which reads this var.

> *Why we need this:* Clerk emits `user.created` on first sign-up. The
> handler calls `syncClerkMemberWithMerge` to provision a Member row
> (email-merge into a Hylo-only row when the email is verified, or
> create a separate Clerk-only row otherwise). Without the webhook,
> Clerk-authed users would have no Member row and `getCurrentMember`
> would return null forever.

## Why this file exists

Dashboard state lives in Clerk's backend, not in our repo. If the dev instance
is destroyed or a new instance is provisioned, default state returns and our
chosen UX (no phone friction, providers limited to Apple/Facebook/Google,
sign-up/sign-in routed to local pages) breaks silently. This file is the
source of truth for re-applying that state by hand.

When dashboard state changes, update this file in the **same commit** as any
related code change.
