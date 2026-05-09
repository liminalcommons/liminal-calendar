'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { UserRole } from '@/lib/auth-helpers';

/**
 * Resolve the current viewer's role from /api/profile.
 *
 * Why not useSession().user.role: NextAuth session.user.role is populated
 * only for Hylo sessions. Clerk-only members carry their role on the DB row,
 * not the session — so client gates must hit /api/profile to read it.
 *
 * Module-level cache keeps a tab to one fetch per session.
 */

let cached: UserRole | null | undefined; // undefined = not fetched, null = unauthed
let inflight: Promise<UserRole | null> | null = null;

async function fetchRole(): Promise<UserRole | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await apiFetch('/api/profile');
      if (!res.ok) { cached = null; return null; }
      const p = await res.json();
      const r: UserRole =
        p.role === 'admin' ? 'admin' : p.role === 'host' ? 'host' : 'member';
      cached = r;
      return r;
    } catch {
      cached = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useResolvedRole(): { role: UserRole | null; resolved: boolean } {
  const [role, setRole] = useState<UserRole | null>(cached ?? null);
  const [resolved, setResolved] = useState<boolean>(cached !== undefined);
  useEffect(() => {
    if (cached !== undefined) {
      setRole(cached);
      setResolved(true);
      return;
    }
    let cancelled = false;
    fetchRole().then(r => {
      if (!cancelled) { setRole(r); setResolved(true); }
    });
    return () => { cancelled = true; };
  }, []);
  return { role, resolved };
}
