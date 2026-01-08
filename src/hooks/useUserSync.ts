'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { upsertUser, getUser, updateUserLastSeen, type UpsertUserInput } from '@/lib/supabase';

interface UseUserSyncResult {
  isSynced: boolean;
  isLoading: boolean;
  error: Error | null;
  timezone: string;
  requestGeolocation: () => Promise<void>;
  setManualTimezone: (timezone: string) => Promise<void>;
}

type TimezoneSource = 'geolocation' | 'browser' | 'ip';

/**
 * Reverse geocode lat/lng to timezone using BigDataCloud (free, no API key)
 */
async function reverseGeocodeTimezone(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/timezone-by-location?latitude=${lat}&longitude=${lng}&key=`
    );
    const data = await response.json();
    return data.iapiTimezone || null;
  } catch {
    return null;
  }
}

/**
 * Get geolocation from browser (requires permission)
 */
function getBrowserGeolocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000, // Cache for 5 minutes
    });
  });
}

/**
 * Syncs the current Clerk user to Supabase with their detected timezone.
 * Priority: Browser Geolocation (with permission) > Browser timezone > IP geolocation
 */
export function useUserSync(): UseUserSyncResult {
  const { user, isLoaded } = useUser();
  const [isSynced, setIsSynced] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [timezone, setTimezone] = useState('UTC');

  const detectTimezone = useCallback(async (tryGeolocation = false): Promise<{ timezone: string; source: TimezoneSource }> => {
    // 1. Try browser Geolocation API (if requested and available)
    if (tryGeolocation && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const position = await getBrowserGeolocation();
        const { latitude, longitude } = position.coords;

        // Reverse geocode to timezone
        const geoTz = await reverseGeocodeTimezone(latitude, longitude);
        if (geoTz) {
          return { timezone: geoTz, source: 'geolocation' };
        }
      } catch (err) {
        console.warn('Geolocation denied or failed:', err);
      }
    }

    // 2. Try browser timezone detection (no permission needed)
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTz && browserTz !== 'UTC') {
        return { timezone: browserTz, source: 'browser' };
      }
    } catch {
      console.warn('Browser timezone detection failed');
    }

    // 3. Fallback to IP geolocation
    try {
      const response = await fetch('/api/detect-timezone');
      const data = await response.json();
      if (data.timezone && data.timezone !== 'UTC') {
        return { timezone: data.timezone, source: 'ip' };
      }
    } catch {
      console.warn('IP geolocation failed');
    }

    // Default fallback
    return { timezone: 'UTC', source: 'browser' };
  }, []);

  // Manual trigger for geolocation permission
  const requestGeolocation = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      const { timezone: detectedTz, source } = await detectTimezone(true);
      setTimezone(detectedTz);

      // Update user in Supabase with new timezone
      const userData: UpsertUserInput = {
        clerk_id: user.id,
        name: user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Anonymous',
        email: user.primaryEmailAddress?.emailAddress,
        avatar_url: user.imageUrl,
        timezone: detectedTz,
        timezone_source: source,
      };

      await upsertUser(userData);
      setIsSynced(true);
    } catch (err) {
      console.error('Geolocation request error:', err);
      setError(err instanceof Error ? err : new Error('Failed to get location'));
    } finally {
      setIsLoading(false);
    }
  }, [user, detectTimezone]);

  // Manual timezone selection
  const setManualTimezone = useCallback(async (selectedTimezone: string) => {
    if (!user) return;

    try {
      setIsLoading(true);
      setTimezone(selectedTimezone);

      // Update user in Supabase with manual timezone
      const userData: UpsertUserInput = {
        clerk_id: user.id,
        name: user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Anonymous',
        email: user.primaryEmailAddress?.emailAddress,
        avatar_url: user.imageUrl,
        timezone: selectedTimezone,
        timezone_source: 'manual',
      };

      await upsertUser(userData);
      setIsSynced(true);
    } catch (err) {
      console.error('Manual timezone error:', err);
      setError(err instanceof Error ? err : new Error('Failed to set timezone'));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    async function syncUser() {
      if (!isLoaded) return;

      // Not logged in - just detect timezone for display
      if (!user) {
        const { timezone: tz } = await detectTimezone();
        setTimezone(tz);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Check if user already has a saved timezone
        const existingUser = await getUser(user.id);

        // If user has manual timezone, respect it - just update last_seen
        if (existingUser && existingUser.timezone_source === 'manual') {
          setTimezone(existingUser.timezone);
          await updateUserLastSeen(user.id);
          setIsSynced(true);
          setIsLoading(false);
          return;
        }

        // Auto-detect timezone
        const { timezone: detectedTz, source } = await detectTimezone();
        setTimezone(detectedTz);

        // Prepare user data for upsert
        const userData: UpsertUserInput = {
          clerk_id: user.id,
          name: user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Anonymous',
          email: user.primaryEmailAddress?.emailAddress,
          avatar_url: user.imageUrl,
          timezone: detectedTz,
          timezone_source: source,
        };

        // Upsert to Supabase
        await upsertUser(userData);
        setIsSynced(true);
      } catch (err) {
        console.error('User sync error:', err);
        setError(err instanceof Error ? err : new Error('Failed to sync user'));
      } finally {
        setIsLoading(false);
      }
    }

    syncUser();
  }, [user, isLoaded, detectTimezone]);

  return { isSynced, isLoading, error, timezone, requestGeolocation, setManualTimezone };
}
