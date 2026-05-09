-- Logto identity: third provider on the members table.
--
-- Castalia (the new canonical signin) issues Logto identities. This
-- migration adds `logto_id` alongside the existing `hylo_id` and
-- `clerk_id`, and broadens the chk_members_identity invariant to allow
-- any one of the three. Hylo + Clerk rows continue to satisfy the
-- constraint unchanged.
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

-- 3. Replace the identity CHECK constraint to allow logto_id as the
--    sole non-null identity. Drop+recreate (PostgreSQL lacks
--    ALTER CONSTRAINT for CHECK predicate changes).
ALTER TABLE members
  DROP CONSTRAINT IF EXISTS chk_members_identity;

ALTER TABLE members
  ADD CONSTRAINT chk_members_identity
  CHECK (hylo_id IS NOT NULL OR clerk_id IS NOT NULL OR logto_id IS NOT NULL);
