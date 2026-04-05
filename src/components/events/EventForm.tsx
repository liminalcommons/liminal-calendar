'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getUserTimezone, formatTimeInTimezone, isLateNightInAnyTimezone, COMMUNITY_TIMEZONES } from '@/lib/timezone-utils';
import { TimeZoneStrip } from '@/components/timezone/TimeZoneStrip';
import { RecurrenceSelector, type RecurrenceValue, type RecurrenceEndType } from './RecurrenceSelector';
import { ImageUpload } from '@/components/ImageUpload';
import { apiFetch } from '@/lib/api-fetch';

// ─── Constants ──────────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_RUNES = ['ᛗ', 'ᛏ', 'ᚹ', 'ᚦ', 'ᚠ', 'ᛊ', 'ᛒ'];

/** Generate all 96 time slots (00:00 → 23:45, 15-min increments) */
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = h.toString().padStart(2, '0');
      const mm = m.toString().padStart(2, '0');
      const value = `${hh}:${mm}`;

      // 12-hour AM/PM label
      const period = h < 12 ? 'AM' : 'PM';
      const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${displayH}:${mm} ${period}`;

      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

/** Add minutes to a HH:MM string, wrapping at 24h */
function addMinutesToTimeStr(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMin = (h * 60 + m + minutes) % (24 * 60);
  const newH = Math.floor(totalMin / 60);
  const newM = totalMin % 60;
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
}

/** Compute minute difference between two HH:MM strings */
function minutesBetween(startStr: string, endStr: string): number {
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

// ─── Week helpers ────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// ─── Hylo Group Picker ──────────────────────────────────────────────────────

function HyloGroupPicker({ groups, selectedIds, onChange }: {
  groups: Array<{ id: string; name: string }>
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = search
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups

  const toggleGroup = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(g => g !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const label = selectedIds.length === 0
    ? "Don't post to Hylo"
    : selectedIds.length === 1
    ? groups.find(g => g.id === selectedIds[0])?.name || '1 group'
    : `${selectedIds.length} groups selected`

  return (
    <div>
      <label className="block text-sm font-medium text-grove-text mb-1">
        Post to Hylo
      </label>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => { setOpen(!open); setSearch('') }}
          className="w-full px-3 py-2 border border-grove-border rounded-lg bg-grove-surface text-grove-text text-sm text-left focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent"
        >
          {label}
        </button>

        {open && (
          <div className="absolute z-50 left-0 right-0 bottom-full mb-1 bg-grove-surface border border-grove-border rounded-lg shadow-lg overflow-hidden">
            <div className="max-h-40 overflow-y-auto">
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="w-full text-left px-3 py-1.5 text-xs text-grove-text-muted hover:bg-grove-border/30 transition-colors"
                >
                  Clear all
                </button>
              )}
              {filtered.map(g => (
                <label
                  key={g.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-grove-border/30 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="rounded border-grove-border text-grove-accent focus:ring-grove-accent"
                  />
                  <span className={selectedIds.includes(g.id) ? 'text-grove-accent' : 'text-grove-text'}>
                    {g.name}
                  </span>
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-grove-text-dim italic">No groups found</p>
              )}
            </div>
            <div className="p-2 border-t border-grove-border/50">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search groups..."
                autoFocus
                className="w-full px-2 py-1.5 text-sm bg-grove-bg border border-grove-border rounded text-grove-text placeholder:text-grove-text-dim focus:outline-none focus:ring-1 focus:ring-grove-accent"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface EventFormProps {
  mode: 'create' | 'edit';
  eventId?: string;
  externalValues?: Partial<{
    title: string
    description: string
    startTime: string
    endTime: string
    date: string
    recurrence: string
    imageUrl: string
    meetingLink: string
  }>
  onSuccess?: () => void
  onValuesChange?: (values: {
    title: string
    description: string
    startTime: string
    endTime: string
    recurrence: string
    imageUrl: string | null
    meetingLink: string
  }) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EventForm({ mode, eventId, externalValues, onValuesChange, onSuccess }: EventFormProps) {
  const router = useRouter();
  const { data: session } = useSession();

  // ── Form state ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetingLink, setMeetingLink] = useState('');

  // Week / day selection
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getWeekStart(tomorrow);
  });
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  // Time selects (HH:MM strings)
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:00');
  // Track duration so end time advances when start changes
  const [durationMinutes, setDurationMinutes] = useState(60);

  // Recurrence
  const [recurrence, setRecurrence] = useState<RecurrenceValue>('none');
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>('never');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | undefined>(undefined);
  const [recurrenceEndCount, setRecurrenceEndCount] = useState<number | undefined>(undefined);

  // Image
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Hylo posting
  const [hyloGroups, setHyloGroups] = useState<Array<{ id: string; name: string }>>([])
  const [selectedHyloGroups, setSelectedHyloGroups] = useState<string[]>([])
  const [postToHylo, setPostToHylo] = useState(false)

  // UI state
  const [timezone, setTimezone] = useState('UTC');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [error, setError] = useState<string | null>(null);

  // Sync external values from chat panel
  useEffect(() => {
    if (!externalValues) return
    if (externalValues.title !== undefined) setTitle(externalValues.title)
    if (externalValues.description !== undefined) setDescription(externalValues.description)
    if (externalValues.meetingLink !== undefined) setMeetingLink(externalValues.meetingLink)
    if (externalValues.imageUrl !== undefined) setImageUrl(externalValues.imageUrl)
    if (externalValues.startTime !== undefined) {
      setStartTime(externalValues.startTime)
      const newEnd = addMinutesToTimeStr(externalValues.startTime, durationMinutes)
      setEndTime(newEnd)
    }
    if (externalValues.endTime !== undefined) setEndTime(externalValues.endTime)
    if (externalValues.recurrence !== undefined) {
      setRecurrence(externalValues.recurrence as RecurrenceValue)
    }
    if (externalValues.date !== undefined) {
      const d = new Date(externalValues.date + 'T00:00:00')
      setCurrentWeekStart(getWeekStart(d))
      const dayOfWeek = d.getDay()
      setSelectedDayIndex(dayOfWeek === 0 ? 6 : dayOfWeek - 1)
    }
    if ((externalValues as any).hyloGroupNames && hyloGroups.length > 0) {
      const names = (externalValues as any).hyloGroupNames as string[]
      const matchedIds = hyloGroups
        .filter(g => names.some(n => g.name.toLowerCase().includes(n.toLowerCase())))
        .map(g => g.id)
      if (matchedIds.length > 0) {
        setSelectedHyloGroups(matchedIds)
        setPostToHylo(true)
      }
    }
  }, [externalValues, durationMinutes, hyloGroups])

  // Notify parent of internal value changes
  useEffect(() => {
    if (!onValuesChange) return
    onValuesChange({
      title,
      description,
      startTime,
      endTime,
      recurrence,
      imageUrl,
      meetingLink,
    })
  }, [title, description, startTime, endTime, recurrence, imageUrl, meetingLink, onValuesChange])

  // ── Derived ───────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const weekRangeLabel = useMemo(() => {
    const endOfWeek = new Date(currentWeekStart);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    const start = currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${start} – ${end}`;
  }, [currentWeekStart]);

  /** The selected Date object (start of day, local) */
  const selectedDay: Date | null = useMemo(() => {
    if (selectedDayIndex === null) return null;
    return weekDays[selectedDayIndex];
  }, [selectedDayIndex, weekDays]);

  /** Combined Date: selectedDay + startTime → local Date (converted to UTC on submit) */
  const selectedStartDate: Date | null = useMemo(() => {
    if (!selectedDay) return null;
    const [h, m] = startTime.split(':').map(Number);
    // Build date in user's local timezone
    const d = new Date(
      selectedDay.getFullYear(),
      selectedDay.getMonth(),
      selectedDay.getDate(),
      h, m, 0, 0,
    );
    return d;
  }, [selectedDay, startTime]);

  /** Local time preview string */
  const localTimePreview: string | null = useMemo(() => {
    if (!selectedStartDate) return null;
    return formatTimeInTimezone(selectedStartDate, timezone);
  }, [selectedStartDate, timezone]);

  const lateNightWarning = useMemo(() => {
    if (!selectedStartDate) return false;
    const communityTzIds = COMMUNITY_TIMEZONES.map((tz) => tz.id);
    return isLateNightInAnyTimezone(selectedStartDate, communityTzIds);
  }, [selectedStartDate]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setTimezone(getUserTimezone());
  }, []);

  // Fetch Hylo groups for posting
  useEffect(() => {
    apiFetch('/api/groups')
      .then(r => r.ok ? r.json() : [])
      .then(groups => {
        if (Array.isArray(groups) && groups.length > 0) {
          setHyloGroups(groups)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (mode === 'create') {
      // Default: tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      setCurrentWeekStart(getWeekStart(tomorrow));
      const dayOfWeek = tomorrow.getDay();
      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      setSelectedDayIndex(dayIndex);
      setStartTime('18:00');
      setEndTime('19:00');
      setDurationMinutes(60);
      return;
    }

    // Edit mode: fetch event
    if (!eventId) return;

    const fetchEvent = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/events/${eventId}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load event');
        }
        const event = await res.json();

        setTitle(event.title || '');
        setDescription(event.description || '');
        setMeetingLink(event.location || '');
        if (event.imageUrl) setImageUrl(event.imageUrl);

        const startDate = new Date(event.starts_at);
        setCurrentWeekStart(getWeekStart(startDate));
        const dayOfWeek = startDate.getDay();
        setSelectedDayIndex(dayOfWeek === 0 ? 6 : dayOfWeek - 1);

        // Use local hours (not UTC) so dropdowns show user's time
        const sh = startDate.getHours().toString().padStart(2, '0');
        const sm = startDate.getMinutes().toString().padStart(2, '0');
        const startStr = `${sh}:${sm}`;
        setStartTime(startStr);

        if (event.ends_at) {
          const endDate = new Date(event.ends_at);
          const eh = endDate.getHours().toString().padStart(2, '0');
          const em = endDate.getMinutes().toString().padStart(2, '0');
          const endStr = `${eh}:${em}`;
          setEndTime(endStr);
          setDurationMinutes(minutesBetween(startStr, endStr));
        } else {
          setEndTime(addMinutesToTimeStr(startStr, 60));
          setDurationMinutes(60);
        }

        if (event.recurrenceRule && event.recurrenceRule !== 'none') {
          setRecurrence(event.recurrenceRule as RecurrenceValue);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvent();
  }, [mode, eventId]);

  // ── Role guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = session?.user as any;
    const role: string = user?.role || 'member';
    if (session !== undefined && role === 'member') {
      router.replace('/');
    }
  }, [session, router]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const goToPrevWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
    setSelectedDayIndex(null);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
    setSelectedDayIndex(null);
  };

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    // Advance end time by same duration
    const newEnd = addMinutesToTimeStr(newStart, durationMinutes);
    setEndTime(newEnd);
  };

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd);
    // Recalculate duration (keep positive)
    const diff = minutesBetween(startTime, newEnd);
    setDurationMinutes(diff > 0 ? diff : 15);
  };

  const handleRecurrenceChange = (
    value: RecurrenceValue,
    endType?: RecurrenceEndType,
    endDate?: string,
    endCount?: number,
  ) => {
    setRecurrence(value);
    if (endType) setRecurrenceEndType(endType);
    if (endDate !== undefined) setRecurrenceEndDate(endDate);
    if (endCount !== undefined) setRecurrenceEndCount(endCount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStartDate) {
      setError('Please select a day and time.');
      return;
    }

    // Validate end > start
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      setError('End time must be after start time.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const [endH, endM] = endTime.split(':').map(Number);
      // Build end date in local timezone (same as start)
      const endDate = new Date(
        selectedDay!.getFullYear(),
        selectedDay!.getMonth(),
        selectedDay!.getDate(),
        endH, endM, 0, 0,
      );

      const body: Record<string, unknown> = {
        title: title.trim(),
        startTime: selectedStartDate.toISOString(),
        endTime: endDate.toISOString(),
        details: description.trim() || undefined,
        timezone,
        location: meetingLink.trim() || undefined,
        recurrenceRule: recurrence !== 'none' ? recurrence : undefined,
        recurrenceEndType: recurrence !== 'none' ? recurrenceEndType : undefined,
        recurrenceEndDate: recurrence !== 'none' && recurrenceEndType === 'on_date' ? recurrenceEndDate : undefined,
        recurrenceEndCount: recurrence !== 'none' && recurrenceEndType === 'after_count' ? recurrenceEndCount : undefined,
        imageUrl: imageUrl || undefined,
        hyloGroupId: postToHylo && selectedHyloGroups.length > 0 ? selectedHyloGroups[0] : undefined,
        hyloGroupIds: postToHylo && selectedHyloGroups.length > 0 ? selectedHyloGroups : undefined,
      };

      if (mode === 'create') {
        const res = await apiFetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create event');
        // API returns DisplayEvent directly
        const newId = data.id || data.event?.id;
        router.push(`/events/${newId}`);
        onSuccess?.()
      } else {
        const res = await apiFetch(`/api/events/${eventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update event');
        router.push(`/events/${eventId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-grove-border/30 rounded-lg w-1/2" />
        <div className="h-32 bg-grove-border/30 rounded-lg" />
        <div className="h-16 bg-grove-border/30 rounded-lg" />
        <div className="h-10 bg-grove-border/30 rounded-lg w-1/3" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Page heading */}
      <h1 className="text-xl font-semibold text-grove-text">
        {mode === 'create' ? 'Create Event' : 'Edit Event'}
      </h1>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-grove-text mb-1">
          Title <span className="text-grove-accent">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Weekly Community Call"
          className="w-full px-3 py-2 border border-grove-border rounded-lg bg-grove-surface text-grove-text placeholder-grove-text-muted focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent text-sm"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-grove-text mb-1">
          Description <span className="text-grove-text-muted text-xs">(optional)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What is this event about?"
          className="w-full px-3 py-2 border border-grove-border rounded-lg bg-grove-surface text-grove-text placeholder-grove-text-muted focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent text-sm resize-none"
        />
      </div>

      {/* Week-based day selector */}
      <div>
        <label className="block text-sm font-medium text-grove-text mb-2">
          Date <span className="text-grove-accent">*</span>
        </label>

        {/* Week nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={goToPrevWeek}
            className="px-3 py-1.5 text-sm text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 rounded-lg transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm font-medium text-grove-text">{weekRangeLabel}</span>
          <button
            type="button"
            onClick={goToNextWeek}
            className="px-3 py-1.5 text-sm text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 rounded-lg transition-colors"
          >
            Next →
          </button>
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, index) => {
            const isToday = day.getTime() === today.getTime();
            const isPast = day < today;
            const isSelected = selectedDayIndex === index;

            return (
              <button
                key={index}
                type="button"
                disabled={isPast}
                onClick={() => setSelectedDayIndex(index)}
                className={[
                  'flex flex-col items-center justify-center py-2 px-1 rounded-lg border-2 transition-all text-center',
                  isPast
                    ? 'opacity-35 cursor-not-allowed border-transparent bg-grove-border/20'
                    : isSelected
                    ? 'border-grove-accent bg-grove-accent/10'
                    : isToday
                    ? 'border-grove-border bg-grove-surface hover:bg-grove-border/20'
                    : 'border-transparent bg-grove-surface hover:bg-grove-border/20',
                ].join(' ')}
              >
                <span className="text-[11px] text-grove-text-muted leading-none mb-0.5">
                  {DAY_RUNES[index]}
                </span>
                <span className={`text-[11px] font-medium leading-none ${isSelected ? 'text-grove-accent' : 'text-grove-text-muted'}`}>
                  {DAY_NAMES[index]}
                </span>
                <span className={`text-base font-bold leading-tight ${isSelected ? 'text-grove-accent' : isToday ? 'text-grove-accent-deep' : 'text-grove-text'}`}>
                  {day.getDate()}
                </span>
                {isToday && !isSelected && (
                  <span className="w-1 h-1 rounded-full bg-grove-accent mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time selects */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="start-time" className="block text-sm font-medium text-grove-text mb-1">
            Start time <span className="text-grove-accent">*</span>
          </label>
          <select
            id="start-time"
            value={startTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            className="w-full px-3 py-2 border border-grove-border rounded-lg bg-grove-surface text-grove-text focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent text-sm"
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="end-time" className="block text-sm font-medium text-grove-text mb-1">
            End time <span className="text-grove-accent">*</span>
          </label>
          <select
            id="end-time"
            value={endTime}
            onChange={(e) => handleEndTimeChange(e.target.value)}
            className="w-full px-3 py-2 border border-grove-border rounded-lg bg-grove-surface text-grove-text focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent text-sm"
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Local time preview + late night warning */}
      {selectedStartDate && localTimePreview && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-grove-text-muted">
            {localTimePreview} your time
            <span className="text-grove-text-dim"> ({timezone})</span>
          </span>
          {lateNightWarning && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              Late night for some community members
            </span>
          )}
        </div>
      )}

      {/* Recurrence + Meeting link */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-grove-text mb-1">
            Recurrence
          </label>
          <RecurrenceSelector value={recurrence} onChange={handleRecurrenceChange} />
        </div>
        <div>
          <label htmlFor="meeting-link" className="block text-sm font-medium text-grove-text mb-1">
            Meeting link <span className="text-grove-text-muted text-xs">(optional)</span>
          </label>
          <input
            id="meeting-link"
            type="url"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 border border-grove-border rounded-lg bg-grove-surface text-grove-text placeholder-grove-text-muted focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Image upload */}
      <ImageUpload onImageUrl={setImageUrl} currentUrl={imageUrl} />

      {/* Actions + Hylo */}
      <div className="flex items-end gap-3 pt-2">
        {mode === 'create' && hyloGroups.length > 0 && (
          <div className="flex-1">
            <HyloGroupPicker
              groups={hyloGroups}
              selectedIds={selectedHyloGroups}
              onChange={(ids) => {
                setSelectedHyloGroups(ids)
                setPostToHylo(ids.length > 0)
              }}
            />
          </div>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !selectedDay}
          className={`py-2 px-6 bg-grove-accent-deep hover:opacity-90 disabled:opacity-50 text-grove-surface font-medium rounded-lg transition-opacity text-sm ${
            mode === 'edit' || hyloGroups.length === 0 ? 'flex-1' : ''
          }`}
        >
          {isSubmitting
            ? 'Saving…'
            : mode === 'create'
            ? 'Create Event'
            : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="py-2 px-4 border border-grove-border text-grove-text hover:bg-grove-border/20 rounded-lg transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
