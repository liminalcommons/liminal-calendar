'use client';

import { useEffect, useState } from 'react';
import { isGuestClient } from '@/lib/guest';

/**
 * Hydration-safe guest check for client components: renders the non-guest
 * tree on the server pass, then flips after mount if the guest cookie is set.
 */
export function useIsGuest(): boolean {
  const [isGuest, setIsGuest] = useState(false);
  useEffect(() => {
    setIsGuest(isGuestClient());
  }, []);
  return isGuest;
}
