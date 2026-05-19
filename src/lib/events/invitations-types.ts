// Client-safe constants and types for invitations.
// Lives in its own module so client components can import without dragging
// the server-only `db` import chain in via invitations-repo.ts.

export const INVITEE_CAP_MEMBER = 10;

export type Invitee = { userId: string; name: string; image?: string | null };
