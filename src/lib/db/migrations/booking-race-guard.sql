-- Booking-event race guard.
--
-- Without this partial unique index, two simultaneous POST /api/booking/*/book
-- calls for the same slot can both pass the application-layer computeSlots()
-- re-validation (neither has inserted yet) and create duplicate events at the
-- same (owner, time). The partial predicate limits the constraint to
-- booking-source events only — manually created events at coincident times
-- are still allowed (e.g. a host can intentionally schedule overlapping
-- non-bookable events).
--
-- Idempotent: safe to re-run.

CREATE UNIQUE INDEX IF NOT EXISTS events_booking_owner_starts_unique
  ON events (member_id, starts_at)
  WHERE source_event_type_id IS NOT NULL;
