'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { createEvent, updateEvent, CalendarEvent, CreateEventInput } from '@/lib/supabase';
import { isGoldenHour, getUserTimezone, formatTimeInTimezone, getGoldenHoursUTC } from '@/lib/golden-hours';
import { TimeZoneStrip } from './TimeZoneStrip';
import { SunRune, ThresholdRune } from './runes';

const DEFAULT_MEETING_LINK = 'https://castalia.liminalcommons.com';

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

      const eventData: CreateEventInput = {
        creator_id: user.id,
        creator_name: user.fullName || user.primaryEmailAddress?.emailAddress || 'Anonymous',
        title,
        description: description || undefined,
        event_url: eventUrl || undefined,
        starts_at: computedStartDate.toISOString(),
        ends_at: endDate.toISOString(),
        timezone,
        is_golden_hour: isGoldenHour(computedStartDate),
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

      {/* Golden Hour Info */}
      <div
        className={`p-4 rounded-lg border ${
          selectedDateIsGolden
            ? 'bg-gold-50 border-gold-300'
            : useCustomTime
              ? 'bg-amber-50 border-amber-300'
              : 'bg-stone-50 border-stone-200'
        }`}
      >
        <div className="flex items-center gap-2">
          {selectedDateIsGolden ? (
            <>
              <SunRune size="lg" variant="gold" />
              <p className="font-medium text-gold-800">
                Golden Hour event - optimal attendance!
              </p>
            </>
          ) : useCustomTime ? (
            <>
              <ThresholdRune size="lg" />
              <p className="font-medium text-amber-800">
                Custom time - outside Golden Hours
              </p>
            </>
          ) : (
            <>
              <ThresholdRune size="lg" variant="gold" />
              <p className="font-medium text-stone-700">
                Select a date and Golden Hour time slot
              </p>
            </>
          )}
        </div>
      </div>

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
