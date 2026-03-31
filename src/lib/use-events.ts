'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DisplayEvent } from './display-event';
import { apiFetch } from './api-fetch';

/**
 * Client-side event store with optimistic updates.
 * Initializes from server props, then refetches on mutations.
 */
export function useEvents(initialEvents: DisplayEvent[]) {
  const [events, setEvents] = useState<DisplayEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Sync if server props change (e.g., navigation)
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/events');
      if (res.ok) {
        const data: DisplayEvent[] = await res.json();
        if (mounted.current) setEvents(data);
      }
    } catch {
      // silent — stale data is better than no data
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const addEvent = useCallback((event: DisplayEvent) => {
    setEvents(prev => [...prev, event]);
    // Background refetch to get server-canonical data
    setTimeout(refetch, 500);
  }, [refetch]);

  const removeEvent = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const updateEvent = useCallback((id: string, patch: Partial<DisplayEvent>) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  return { events, loading, refetch, addEvent, removeEvent, updateEvent };
}
