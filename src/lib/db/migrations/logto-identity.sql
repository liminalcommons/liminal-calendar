-- Logto identity: an additional provider on the members table.
--
-- Castalia (the new canonical signin) issues Logto identities. This
-- migration adds `logto_id` alongside the existing `clerk_id`, and
-- (historically) broadened the chk_members_identity invariant.
--
-- NOTE: the legacy identity CHECK has since been retired entirely (a row
-- may carry only an email), so the re-ADD at the bottom of this file is
-- now superseded by the unconditional DROP in migrate.ts.
--
-- Additive only. No row-level migration. The first-signin auto-link
-- (a separate step) attaches logto_id to existing rows by email match.
--
-- Idempotent.

-- 1. Add the column. NULL for every existing row; first Logto signin
--    fills it. UNIQUE prevents two members from claiming the same Logto
--    identity (subject id from JWT `sub`).
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS logto_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_logto_id_unique'
      AND conrelid = 'members'::regclass
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_logto_id_unique UNIQUE (logto_id);
  END IF;
END $$;

-- 2. Index for the per-request lookup path
--    (`select members where logto_id = $1`).
CREATE INDEX IF NOT EXISTS idx_members_logto_id ON members(logto_id);

-- 3. Drop the legacy identity CHECK constraint. (This historically
--    re-added a widened CHECK; that re-ADD has been removed — a Member
--    row may now be valid with only an email, e.g. pending re-signup.)
ALTER TABLE members
  DROP CONSTRAINT IF EXISTS chk_members_identity;
