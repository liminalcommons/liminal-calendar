'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { addMonths } from 'date-fns';
import type { DisplayEvent } from './display-event';
import { apiFetch } from './api-fetch';
import { expandRecurringEvents } from './recurrence-expander';

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
        // Expand recurring events client-side (6-month window)
        const now = new Date();
        const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const rangeEnd = addMonths(now, 6);
        const expanded = expandRecurringEvents(data, rangeStart, rangeEnd);
        if (mounted.current) setEvents(expanded);
      }
    } catch {
      // silent
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const addEvent = useCallback((event: DisplayEvent) => {
    // Expand recurring event instances immediately
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const rangeEnd = addMonths(now, 6);
    const expanded = expandRecurringEvents([event], rangeStart, rangeEnd);
    for (const e of expanded) {
      setSpawningIds(prev => new Set(prev).add(e.id));
    }
    setEvents(prev => [...prev, ...expanded]);
    setTimeout(refetch, 500);
    // Clear spawn flags after animation
    const expandedIds = expanded.map(e => e.id);
    setTimeout(() => {
      setSpawningIds(prev => {
        const next = new Set(prev);
        for (const id of expandedIds) next.delete(id);
        return next;
      });
    }, 500);
  }, [refetch]);

  const removeEvent = useCallback((id: string) => {
    // For recurring events, the original ID is the base (without -YYYYMMDD suffix)
    const baseId = id.replace(/-\d{8}$/, '');
    // Find all instances of this event (original + expanded)
    setEvents(prev => {
      const matchingIds = prev
        .filter(e => e.id === baseId || e.id.startsWith(baseId + '-'))
        .map(e => e.id);
      // Mark all as dissolving
      setDissolvingIds(p => {
        const next = new Set(p);
        for (const mid of matchingIds) next.add(mid);
        return next;
      });
      // Remove after animation
      setTimeout(() => {
        setEvents(p => p.filter(e => !matchingIds.includes(e.id)));
        setDissolvingIds(p => {
          const next = new Set(p);
          for (const mid of matchingIds) next.delete(mid);
          return next;
        });
      }, 350);
      return prev;
    });
  }, []);

  const updateEvent = useCallback((id: string, patch: Partial<DisplayEvent>) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  return { events, loading, dissolvingIds, spawningIds, refetch, addEvent, removeEvent, updateEvent };
}
