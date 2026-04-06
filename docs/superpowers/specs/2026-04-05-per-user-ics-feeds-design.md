# Per-User ICS Calendar Feeds

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Single-story (schema + route + UI)

## Summary

Replace the universal ICS subscription feed with per-user feeds. Each user gets a unique, permanent, revocable feed URL. Today the feed returns all events (same as current behavior). In the future, algorithmic filtering will customize what each user sees.

## Design

### 1. Schema: `feed_token` column on `members`

Add `feed_token` (text, unique, nullable) to the `members` table. Tokens are `feed_<24-char-random-hex>` — short enough for URLs, unique enough to be unguessable.

### 2. Token Generation

On user upsert (session callback in `auth.ts`), if the member has no `feed_token`, generate one. This happens alongside the existing non-blocking upsert. Existing members get tokens lazily on next login.

### 3. Feed Route

`GET /api/calendar/feed.ics?token=feed_abc123`

- If `token` is provided and valid: identify user, return events (today: all events; future: filtered)
- If `token` is missing or invalid: return all events (backward compatible — existing universal subscribers keep working)
- Response headers remain the same (15min cache, `text/calendar`)

### 4. Subscribe UI

`SubscribeBanner` and `SubscribePrompt` currently hardcode the universal feed URL. Change them to:
- **Authenticated users**: fetch their `feed_token` from a new lightweight API endpoint (`GET /api/calendar/feed-token`) and build per-user URLs
- **Unauthenticated users**: show universal feed URL (fallback)

### 5. Token Regeneration

`POST /api/calendar/feed-token` — regenerates the user's feed token. Old feed URL stops working immediately. Requires authentication.

### 6. Feed Token API

`GET /api/calendar/feed-token` — returns the authenticated user's current feed token. Creates one if missing.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `feedToken` column to `members` |
| `auth.ts` | Generate `feedToken` on upsert if missing |
| `src/app/api/calendar/feed.ics/route.ts` | Read `?token=` param, look up user |
| `src/app/api/calendar/feed-token/route.ts` | **New** — GET (fetch token), POST (regenerate) |
| `src/components/SubscribeBanner.tsx` | Use per-user URLs when available |
| `src/components/SubscribePrompt.tsx` | Use per-user URLs when available |

## Backward Compatibility

The universal feed URL continues to work (no token = all events). Existing subscribers are not broken. This is additive — per-user URLs are opt-in via the subscribe UI.
