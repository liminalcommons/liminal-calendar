'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import {
  createEvent,
  updateEvent,
  CalendarEvent,
  CreateEventInput,
  RecurrenceRule,
  RecurrencePattern,
  EventVisibility,
  EventType
} from '@/lib/supabase';
import { isGoldenHour, getUserTimezone, formatTimeInTimezone, getGoldenHoursUTC } from '@/lib/golden-hours';
import { RECURRENCE_OPTIONS } from '@/lib/recurrence';
import { EVENT_TYPE_OPTIONS, getEventTypeConfig } from '@/lib/event-types';
import { TimeZoneStrip } from './TimeZoneStrip';
import { SunRune, ThresholdRune } from './runes';

const DEFAULT_MEETING_LINK = 'https://castalia.liminalcommons.com';

// Visibility options
const VISIBILITY_OPTIONS: { value: EventVisibility; label: string; description: string }[] = [
  { value: 'public', label: 'Public', description: 'Anyone can see this event' },
  { value: 'members_only', label: 'Members Only', description: 'Only signed-in members can see' },
  { value: 'invite_only', label: 'Invite Only', description: 'Only invited emails can see' },
];

// Day names and runes
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_RUNES = ['ᛗ', 'ᛏ', 'ᚹ', 'ᚦ', 'ᚠ', 'ᛊ', 'ᛊ'];

// Get Monday of the week containing a date
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Get array of 7 days starting from Monday
function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Generate Golden Hour time slots (30 min intervals)
function getGoldenHourSlots(date: Date): { utcHour: number; utcMinute: number; label: string }[] {
  // Use UTC day to avoid timezone issues
  const isWeekend = [0, 6].includes(date.getUTCDay());
  const { start: startHour, duration } = getGoldenHoursUTC(isWeekend);

  const slots: { utcHour: number; utcMinute: number; label: string }[] = [];
  for (let i = 0; i < duration * 2; i++) { // 30 min intervals
    const hour = startHour + Math.floor(i / 2);
    const minute = (i % 2) * 30;
    slots.push({
      utcHour: hour,
      utcMinute: minute,
      label: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} UTC`,
    });
  }
  return slots;
}

interface EventFormProps {
  event?: CalendarEvent;
  mode: 'create' | 'edit';
}

export function EventForm({ event, mode }: EventFormProps) {
  const router = useRouter();
  const { user } = useUser();
  const [timezone, setTimezone] = useState('UTC');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [eventUrl, setEventUrl] = useState(event?.event_url || DEFAULT_MEETING_LINK);

  // New fields: Recurrence, Visibility, Event Type
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>(
    event?.recurrence_rule?.pattern || 'none'
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>(
    event?.recurrence_rule?.endDate || ''
  );
  const [visibility, setVisibility] = useState<EventVisibility>(
    event?.visibility || 'public'
  );
  const [allowedEmails, setAllowedEmails] = useState<string>(
    event?.allowed_emails?.join(', ') || ''
  );
  const [eventType, setEventType] = useState<EventType>(
    event?.event_type || 'general'
  );

  // Week navigation + Day + Time Slot selection
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    return getWeekStart(today);
  });
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null); // 0-6 (Mon-Sun)
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState(''); // HH:MM

  // Get days of current week
  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart]);

  // Get selected date from day index
  const selectedDate = useMemo(() => {
    if (selectedDayIndex === null) return '';
    return weekDays[selectedDayIndex].toISOString().split('T')[0];
  }, [selectedDayIndex, weekDays]);

  // Today for comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute the actual start time from date + slot
  const computedStartDate = useMemo(() => {
    if (!selectedDate) return null;

    const date = new Date(selectedDate + 'T00:00:00Z');

    if (useCustomTime && customTime) {
      const [hours, minutes] = customTime.split(':').map(Number);
      date.setUTCHours(hours, minutes, 0, 0);
    } else {
      const slots = getGoldenHourSlots(date);
      if (slots[selectedSlotIndex]) {
        date.setUTCHours(slots[selectedSlotIndex].utcHour, slots[selectedSlotIndex].utcMinute, 0, 0);
      }
    }

    return date;
  }, [selectedDate, selectedSlotIndex, useCustomTime, customTime]);

  // Get available slots for the selected date
  const timeSlots = useMemo(() => {
    if (!selectedDate) return [];
    const date = new Date(selectedDate + 'T00:00:00Z');
    return getGoldenHourSlots(date);
  }, [selectedDate]);

  const selectedDateIsGolden = useMemo(() => {
    if (!computedStartDate) return false;
    return isGoldenHour(computedStartDate);
  }, [computedStartDate]);

  useEffect(() => {
    const tz = getUserTimezone();
    setTimezone(tz);

    // Set default to tomorrow
    if (mode === 'create') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      // Set week containing tomorrow
      setCurrentWeekStart(getWeekStart(tomorrow));

      // Find tomorrow's index in the week (0-6)
      const dayOfWeek = tomorrow.getDay();
      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sun=0 to index 6, Mon=1 to index 0
      setSelectedDayIndex(dayIndex);
      setSelectedSlotIndex(0);
    } else if (event) {
      // Edit mode - populate from existing event
      const startDate = new Date(event.starts_at);

      // Set week containing the event
      setCurrentWeekStart(getWeekStart(startDate));

      // Find day index
      const dayOfWeek = startDate.getDay();
      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      setSelectedDayIndex(dayIndex);

      // Try to find matching slot
      const slots = getGoldenHourSlots(startDate);
      const utcHour = startDate.getUTCHours();
      const utcMinute = startDate.getUTCMinutes();
      const matchingIndex = slots.findIndex(
        s => s.utcHour === utcHour && s.utcMinute === utcMinute
      );

      if (matchingIndex >= 0) {
        setSelectedSlotIndex(matchingIndex);
      } else {
        setUseCustomTime(true);
        setCustomTime(`${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')}`);
      }
    }
  }, [mode, event]);

  // Week navigation
  const goToPrevWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
    setSelectedDayIndex(null); // Clear selection when changing weeks
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
    setSelectedDayIndex(null);
  };

  // Format week range for display
  const weekRangeLabel = useMemo(() => {
    const endOfWeek = new Date(currentWeekStart);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    const startMonth = currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startMonth} - ${endMonth}`;
  }, [currentWeekStart]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !computedStartDate) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // End time is 1 hour after start
      const endDate = new Date(computedStartDate.getTime() + 60 * 60 * 1000);

      // Build recurrence rule if pattern is not 'none'
      const recurrenceRule: RecurrenceRule | undefined =
        recurrencePattern !== 'none'
          ? {
              pattern: recurrencePattern,
              endDate: recurrenceEndDate || undefined,
            }
          : undefined;

      // Parse allowed emails for invite-only events
      const parsedAllowedEmails =
        visibility === 'invite_only' && allowedEmails
          ? allowedEmails.split(',').map(e => e.trim()).filter(Boolean)
          : undefined;

      const eventData: CreateEventInput = {
        creator_id: user.id,
        creator_name: user.fullName || user.primaryEmailAddress?.emailAddress || 'Anonymous',
        creator_image_url: user.imageUrl || undefined,
        title,
        description: description || undefined,
        event_url: eventUrl || undefined,
        starts_at: computedStartDate.toISOString(),
        ends_at: endDate.toISOString(),
        timezone,
        is_golden_hour: isGoldenHour(computedStartDate),
        recurrence_rule: recurrenceRule,
        visibility,
        allowed_emails: parsedAllowedEmails,
        event_type: eventType,
      };

      if (mode === 'create') {
        const newEvent = await createEvent(eventData);
        router.push(`/events/${newEvent.id}`);
      } else if (event) {
        await updateEvent(event.id, eventData);
        router.push(`/events/${event.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Event Type Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Event Type
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {EVENT_TYPE_OPTIONS.map((option) => {
            const config = getEventTypeConfig(option.value);
            const isSelected = eventType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setEventType(option.value)}
                className={`p-2 rounded-lg border-2 transition-all text-center ${
                  isSelected
                    ? `${config.borderColor} ${config.bgColor} ring-2 ring-offset-1`
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
                style={isSelected ? { borderColor: config.color } : {}}
              >
                <div className="text-xl">{option.icon}</div>
                <div className={`text-xs font-medium ${isSelected ? config.textColor : 'text-stone-600'}`}>
                  {option.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Status (toned down) */}
      {computedStartDate && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            selectedDateIsGolden
              ? 'bg-stone-50 border-stone-200 text-stone-700'
              : 'bg-stone-50 border-stone-200 text-stone-600'
          }`}
        >
          <div className="flex items-center gap-2">
            {selectedDateIsGolden ? (
              <>
                <SunRune size="sm" variant="gold" />
                <span>This time is within Golden Hours</span>
              </>
            ) : (
              <>
                <ThresholdRune size="sm" />
                <span>Custom time selected</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Event Title *
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-golden-500 focus:border-transparent"
          placeholder="Weekly Community Call"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-golden-500 focus:border-transparent"
          placeholder="What's this event about?"
        />
      </div>

      {/* Week Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Day *
        </label>

        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={goToPrevWeek}
            className="p-2 rounded-lg hover:bg-stone-100 transition-colors"
          >
            ← Prev
          </button>
          <span className="font-rune text-lg text-stone-700">{weekRangeLabel}</span>
          <button
            type="button"
            onClick={goToNextWeek}
            className="p-2 rounded-lg hover:bg-stone-100 transition-colors"
          >
            Next →
          </button>
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, index) => {
            const isToday = day.getTime() === today.getTime();
            const isPast = day < today;
            const isWeekend = index >= 5;
            const isSelected = selectedDayIndex === index;

            return (
              <button
                key={index}
                type="button"
                disabled={isPast}
                onClick={() => {
                  setSelectedDayIndex(index);
                  setSelectedSlotIndex(0);
                }}
                className={`
                  p-2 rounded-lg text-center transition-all border-2
                  ${isPast
                    ? 'opacity-40 cursor-not-allowed border-transparent bg-stone-100'
                    : isSelected
                      ? 'border-gold-500 bg-gold-100 text-gold-900'
                      : isToday
                        ? 'border-gold-300 bg-gold-50 hover:bg-gold-100'
                        : isWeekend
                          ? 'border-transparent bg-stone-50 hover:bg-stone-100'
                          : 'border-transparent bg-white hover:bg-stone-50'
                  }
                `}
              >
                <div className="text-xs text-stone-500">{DAY_RUNES[index]}</div>
                <div className={`text-xs font-medium ${isSelected ? 'text-gold-800' : 'text-stone-600'}`}>
                  {DAY_NAMES[index]}
                </div>
                <div className={`text-lg font-bold ${isSelected ? 'text-gold-900' : isToday ? 'text-gold-700' : 'text-stone-800'}`}>
                  {day.getDate()}
                </div>
                {isWeekend && (
                  <div className="text-[10px] text-gold-600">3h</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Golden Hour Time Slots */}
      {selectedDate && !useCustomTime && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <SunRune size="sm" className="mr-1" />
            Golden Hour Time Slot *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {timeSlots.map((slot, index) => {
              const slotDate = new Date(selectedDate + 'T00:00:00Z');
              slotDate.setUTCHours(slot.utcHour, slot.utcMinute, 0, 0);
              const localTime = formatTimeInTimezone(slotDate, timezone);

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedSlotIndex(index)}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    selectedSlotIndex === index
                      ? 'border-gold-500 bg-gold-100 text-gold-900'
                      : 'border-stone-200 bg-white hover:border-gold-300 text-stone-700'
                  }`}
                >
                  <div className="font-mono text-lg font-bold">{localTime}</div>
                  <div className="text-xs text-stone-500">{slot.label}</div>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setUseCustomTime(true)}
            className="mt-2 text-sm text-stone-500 hover:text-stone-700 underline"
          >
            Use custom time instead
          </button>
        </div>
      )}

      {/* Custom Time (outside Golden Hours) */}
      {useCustomTime && (
        <div>
          <label htmlFor="customTime" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Custom Time (UTC) *
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="time"
              id="customTime"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              required
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-golden-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => {
                setUseCustomTime(false);
                setSelectedSlotIndex(0);
              }}
              className="px-3 py-2 text-sm text-gold-600 hover:text-gold-800 underline"
            >
              Use Golden Hours
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-600">
            Events outside Golden Hours may have lower attendance.
          </p>
        </div>
      )}

      {/* TimeZone Strip - shows selected time across regions */}
      {computedStartDate && (
        <div className="p-4 bg-parchment dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700">
          <TimeZoneStrip selectedTime={computedStartDate} userTimezone={timezone} />
        </div>
      )}

      {/* Meeting URL */}
      <div>
        <label htmlFor="eventUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Meeting Link <span className="text-gray-500">(optional)</span>
        </label>
        <input
          type="url"
          id="eventUrl"
          value={eventUrl}
          onChange={(e) => setEventUrl(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-golden-500 focus:border-transparent"
          placeholder="https://castalia.liminalcommons.com"
        />
      </div>

      {/* Recurrence */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Repeat
        </label>
        <div className="flex flex-wrap gap-2">
          {RECURRENCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRecurrencePattern(option.value)}
              className={`px-3 py-1.5 rounded-lg border transition-all text-sm ${
                recurrencePattern === option.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-stone-200 bg-white hover:border-stone-300 text-stone-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {recurrencePattern !== 'none' && (
          <div className="mt-3">
            <label htmlFor="recurrenceEndDate" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              End recurring on (optional)
            </label>
            <input
              type="date"
              id="recurrenceEndDate"
              value={recurrenceEndDate}
              onChange={(e) => setRecurrenceEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              Recurring events will be created up to 12 weeks ahead
            </p>
          </div>
        )}
      </div>

      {/* Visibility */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Who can see this event?
        </label>
        <div className="space-y-2">
          {VISIBILITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                visibility === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-stone-200 bg-white hover:border-stone-300'
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={visibility === option.value}
                onChange={() => setVisibility(option.value)}
                className="mt-0.5 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className={`font-medium ${visibility === option.value ? 'text-blue-700' : 'text-stone-700'}`}>
                  {option.label}
                </div>
                <div className="text-xs text-stone-500">{option.description}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Invite-only email list */}
        {visibility === 'invite_only' && (
          <div className="mt-3">
            <label htmlFor="allowedEmails" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Invited email addresses (comma-separated)
            </label>
            <textarea
              id="allowedEmails"
              value={allowedEmails}
              onChange={(e) => setAllowedEmails(e.target.value)}
              rows={2}
              placeholder="alice@example.com, bob@example.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-2 px-4 bg-golden-500 hover:bg-golden-600 disabled:bg-golden-300 text-white font-medium rounded-lg transition-colors"
        >
          {isSubmitting
            ? 'Saving...'
            : mode === 'create'
            ? 'Create Event'
            : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
