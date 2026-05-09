'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { UserRole } from '@/lib/auth-helpers';

/**
 * Resolve the current viewer's role + identifiers from /api/profile.
 *
 * Why not useSession().user: NextAuth session.user is populated only for
 * Hylo sessions. Clerk-only members carry their role + clerkId on the DB
 * row — client gates must hit /api/profile to read them.
 *
 * Module-level cache keeps a tab to one fetch per session.
 */

export type ResolvedProfile = {
  role: UserRole;
  hyloId: string | null;
  clerkId: string | null;
  /** Canonical id for ownership comparisons against events.creator_id. */
  userId: string | null;
};

let cached: ResolvedProfile | null | undefined; // undefined = not fetched, null = unauthed
let inflight: Promise<ResolvedProfile | null> | null = null;

async function fetchProfile(): Promise<ResolvedProfile | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await apiFetch('/api/profile');
      if (!res.ok) { cached = null; return null; }
      const p = await res.json();
      const role: UserRole =
        p.role === 'admin' ? 'admin' : p.role === 'host' ? 'host' : 'member';
      // Identity precedence mirrors getAuthedUser: hyloId first, then
      // clerkId. This must match what POST /api/events stored in
      // events.creator_id at creation time.
      const profile: ResolvedProfile = {
        role,
        hyloId: p.hyloId ?? null,
        clerkId: p.clerkId ?? null,
        userId: p.hyloId ?? p.clerkId ?? null,
      };
      cached = profile;
      return profile;
    } catch {
      cached = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useResolvedProfile(): { profile: ResolvedProfile | null; resolved: boolean } {
  const [profile, setProfile] = useState<ResolvedProfile | null>(cached ?? null);
  const [resolved, setResolved] = useState<boolean>(cached !== undefined);
  useEffect(() => {
    if (cached !== undefined) {
      setProfile(cached);
      setResolved(true);
      return;
    }
    let cancelled = false;
    fetchProfile().then(p => {
      if (!cancelled) { setProfile(p); setResolved(true); }
    });
    return () => { cancelled = true; };
  }, []);
  return { profile, resolved };
}

/** Backward-compat shim — returns just the role. */
export function useResolvedRole(): { role: UserRole | null; resolved: boolean } {
  const { profile, resolved } = useResolvedProfile();
  return { role: profile?.role ?? null, resolved };
}
