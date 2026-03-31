'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DisplayEvent } from './display-event';
import { apiFetch } from './api-fetch';

/**
 * Client-side event store with optimistic updates.
 * Initializes from server props, then refetches on mutations.
 *
 * Tracks "dissolving" IDs so EventBlock can animate before removal.
 * Tracks "spawning" IDs so EventBlock only animates on first appearance.
 */
export function useEvents(initialEvents: DisplayEvent[]) {
  const [events, setEvents] = useState<DisplayEvent[]>(initialEvents);
  const [dissolvingIds, setDissolvingIds] = useState<Set<string>>(new Set());
  const [spawningIds, setSpawningIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

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
      // silent
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const addEvent = useCallback((event: DisplayEvent) => {
    setSpawningIds(prev => new Set(prev).add(event.id));
    setEvents(prev => [...prev, event]);
    setTimeout(refetch, 500);
    // Clear spawn flag after animation
    setTimeout(() => {
      setSpawningIds(prev => {
        const next = new Set(prev);
        next.delete(event.id);
        return next;
      });
    }, 500);
  }, [refetch]);

  const removeEvent = useCallback((id: string) => {
    // Mark as dissolving — EventBlock plays animation
    setDissolvingIds(prev => new Set(prev).add(id));
    // Remove from state after animation completes
    setTimeout(() => {
      setEvents(prev => prev.filter(e => e.id !== id));
      setDissolvingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 350); // matches glitch-dissolve duration
  }, []);

  const updateEvent = useCallback((id: string, patch: Partial<DisplayEvent>) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  return { events, loading, dissolvingIds, spawningIds, refetch, addEvent, removeEvent, updateEvent };
}
