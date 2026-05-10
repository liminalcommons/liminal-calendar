/**
 * Castalia room URL minter — stub for v1 of Plan 3 (1:1 Booking).
 *
 * Returns a synthetic `https://castalia.one/r/<slug>` URL. The real Castalia
 * room provisioning (Colyseus room reservation, persistent room state) is
 * deferred to a follow-up. For v1 the URL is opaque to callers: it simply
 * becomes the booked event's `location` and is rendered as a link.
 *
 * Args are accepted to keep the future-real signature stable; they are
 * unused by the stub.
 */

import { randomUUID } from 'crypto';

export async function mintCastaliaRoomUrl(_args: {
  ownerId: number;
  bookerId: number;
}): Promise<string> {
  const slug = randomUUID().slice(0, 12);
  return `https://castalia.one/r/${slug}`;
}
