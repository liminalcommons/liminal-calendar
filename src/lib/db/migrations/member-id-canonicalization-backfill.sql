-- Phase 1 backfill — match every legacy provider-string id to members.id.
--
-- Idempotent: each UPDATE only touches rows where member_id IS NULL, and the
-- JOIN on members.hylo_id OR members.clerk_id is the same lookup either way.
-- Rows whose creator/user/etc. has no `members` row remain NULL — those are
-- the rows that need a `members` row provisioned (Clerk users who never
-- signed in after the webhook landed, orphan ids from past imports, etc.).
-- Phase 2 dual-writes will surface those gaps over time; we do not fabricate
-- members rows here.

-- ─── events.creator_id → events.member_id ────────────────────────────────
UPDATE events e
SET member_id = m.id
FROM members m
WHERE e.member_id IS NULL
  AND (e.creator_id = m.hylo_id OR e.creator_id = m.clerk_id);

-- ─── rsvps.user_id → rsvps.member_id ─────────────────────────────────────
UPDATE rsvps r
SET member_id = m.id
FROM members m
WHERE r.member_id IS NULL
  AND (r.user_id = m.hylo_id OR r.user_id = m.clerk_id);

-- ─── event_comments.author_id → event_comments.member_id ─────────────────
UPDATE event_comments c
SET member_id = m.id
FROM members m
WHERE c.member_id IS NULL
  AND (c.author_id = m.hylo_id OR c.author_id = m.clerk_id);

-- ─── attendance_reports.reporter_id → attendance_reports.member_id ───────
UPDATE attendance_reports a
SET member_id = m.id
FROM members m
WHERE a.member_id IS NULL
  AND (a.reporter_id = m.hylo_id OR a.reporter_id = m.clerk_id);

-- ─── event_invitations.invitee_user_id → event_invitations.member_id ─────
UPDATE event_invitations i
SET member_id = m.id
FROM members m
WHERE i.member_id IS NULL
  AND (i.invitee_user_id = m.hylo_id OR i.invitee_user_id = m.clerk_id);

-- ─── notifications.user_id → notifications.member_id ────────────────────
UPDATE notifications n
SET member_id = m.id
FROM members m
WHERE n.member_id IS NULL
  AND (n.user_id = m.hylo_id OR n.user_id = m.clerk_id);

-- ─── notifications.actor_id → notifications.actor_member_id ─────────────
UPDATE notifications n
SET actor_member_id = m.id
FROM members m
WHERE n.actor_member_id IS NULL
  AND n.actor_id IS NOT NULL
  AND (n.actor_id = m.hylo_id OR n.actor_id = m.clerk_id);

-- ─── push_subscriptions.user_id → push_subscriptions.member_id ──────────
-- (No-op when the table is absent — Phase 1 migration skips the ADD COLUMN
-- in that case, so the column reference here would fail. Wrapped in a DO
-- block to make it a no-op when the table is missing.)
DO $$ BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    UPDATE push_subscriptions p
    SET member_id = m.id
    FROM members m
    WHERE p.member_id IS NULL
      AND (p.user_id = m.hylo_id OR p.user_id = m.clerk_id);
  END IF;
END $$;

-- ─── notification_preferences.user_id → notification_preferences.member_id ─
UPDATE notification_preferences np
SET member_id = m.id
FROM members m
WHERE np.member_id IS NULL
  AND (np.user_id = m.hylo_id OR np.user_id = m.clerk_id);

-- ─── notification_log.user_id → notification_log.member_id ──────────────
UPDATE notification_log nl
SET member_id = m.id
FROM members m
WHERE nl.member_id IS NULL
  AND (nl.user_id = m.hylo_id OR nl.user_id = m.clerk_id);

-- ─── event_types.owner_id → event_types.owner_member_id ─────────────────
UPDATE event_types et
SET owner_member_id = m.id
FROM members m
WHERE et.owner_member_id IS NULL
  AND (et.owner_id = m.hylo_id OR et.owner_id = m.clerk_id);

-- ─── bookable_windows.owner_id → bookable_windows.owner_member_id ───────
UPDATE bookable_windows bw
SET owner_member_id = m.id
FROM members m
WHERE bw.owner_member_id IS NULL
  AND (bw.owner_id = m.hylo_id OR bw.owner_id = m.clerk_id);

-- ─── marketplace_submissions.submitter_user_id → submitter_member_id ────
DO $$ BEGIN
  IF to_regclass('public.marketplace_submissions') IS NOT NULL THEN
    UPDATE marketplace_submissions ms
    SET submitter_member_id = m.id
    FROM members m
    WHERE ms.submitter_member_id IS NULL
      AND ms.submitter_user_id IS NOT NULL
      AND (ms.submitter_user_id = m.hylo_id OR ms.submitter_user_id = m.clerk_id);
  END IF;
END $$;

-- ─── image_generations.user_id → image_generations.member_id ────────────
DO $$ BEGIN
  IF to_regclass('public.image_generations') IS NOT NULL THEN
    UPDATE image_generations ig
    SET member_id = m.id
    FROM members m
    WHERE ig.member_id IS NULL
      AND (ig.user_id = m.hylo_id OR ig.user_id = m.clerk_id);
  END IF;
END $$;
