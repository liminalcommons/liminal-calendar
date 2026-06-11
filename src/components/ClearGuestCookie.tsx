'use client';

import { useEffect } from 'react';
import { GUEST_COOKIE } from '@/lib/guest';

/**
 * Rendered by HomePage only when the visitor is authenticated: a guest who
 * signs up/in keeps the guest cookie otherwise, which would leave Join
 * Meeting disabled. Mounted as the FIRST child so its effect fires before
 * any useIsGuest() consumer reads the cookie.
 */
export function ClearGuestCookie() {
  useEffect(() => {
    document.cookie = `${GUEST_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }, []);
  return null;
}
