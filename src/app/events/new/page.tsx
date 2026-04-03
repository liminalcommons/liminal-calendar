'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format, addHours, parse } from 'date-fns';
import { NavBar } from '@/components/NavBar';
import { InviteePicker, type PickedMember } from '@/components/events/InviteePicker';
import { SchedulingSuggestions } from '@/components/events/SchedulingSuggestions';
import type { SchedulingSuggestion } from '@/lib/scheduling';
import { apiFetch } from '@/lib/api-fetch';

const DURATION_OPTIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hours', minutes: 90 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
];

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

function getDefaultDateTime(): { date: string; time: string } {
  const now = new Date();
  const next = addHours(now, 1);
  next.setMinutes(next.getMinutes() >= 30 ? 30 : 0, 0, 0);
  return {
    date: format(next, 'yyyy-MM-dd'),
    time: format(next, 'HH:mm'),
  };
}

export default function NewEventPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill from query params (from quick create "More options →")
  const paramDay = searchParams.get('day');
  const paramSlot = searchParams.get('slot');
  const defaults = getDefaultDateTime();

  let initDate = defaults.date;
  let initTime = defaults.time;
  if (paramDay) initDate = paramDay;
  if (paramSlot) {
    const slot = parseInt(paramSlot, 10);
    const h = Math.floor(slot / 2);
    const m = (slot % 2) * 30;
    initTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initDate);
  const [time, setTime] = useState(initTime);
  const [duration, setDuration] = useState(60);
  const [meetingLink, setMeetingLink] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [invitees, setInvitees] = useState<PickedMember[]>([]);
  const [creating, setCreating] = useState(false);

  const handleSuggestionSelect = useCallback((suggestion: SchedulingSuggestion) => {
    // Convert suggestion to a date — find next occurrence of that day
    const now = new Date();
    const todayDow = (now.getDay() + 6) % 7; // Mon=0
    let daysAhead = suggestion.dayIndex - todayDow;
    if (daysAhead <= 0) daysAhead += 7;
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysAhead);
    setDate(format(targetDate, 'yyyy-MM-dd'));
    setTime(suggestion.startTime);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setCreating(true);

    const startTime = new Date(`${date}T${time}:00`);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    try {
      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          details: description || undefined,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          location: meetingLink || undefined,
          recurrenceRule: recurrence || undefined,
          invitees: invitees.map(i => i.hyloId),
        }),
      });
      if (res.ok) {
        router.push('/');
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }, [title, description, date, time, duration, meetingLink, recurrence, invitees, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-grove-bg">
        <NavBar />
        <div className="flex items-center justify-center py-20">
          <p className="text-grove-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-grove-text-muted hover:text-grove-text mb-6 transition-colors"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-serif text-grove-text mb-6">Create Event</h1>

        <div className="flex gap-6">
          {/* Left column — Event form */}
          <div className="flex-1 space-y-4">
            <div className="bg-grove-surface border border-grove-border rounded-xl p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-grove-text-muted uppercase tracking-wider block mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Event title"
                  className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                             text-grove-text placeholder:text-grove-text-dim
                             focus:outline-none focus:ring-1 focus:ring-grove-accent"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-grove-text-muted uppercase tracking-wider block mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What's this event about?"
                  rows={3}
                  className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                             text-grove-text placeholder:text-grove-text-dim resize-none
                             focus:outline-none focus:ring-1 focus:ring-grove-accent"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-grove-text-muted uppercase tracking-wider block mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                               text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
                  />
                </div>
                <div className="w-28">
                  <label className="text-[11px] font-semibold text-grove-text-muted uppercase tracking-wider block mb-1">Time</label>
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                               text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
                  />
                </div>
                <div className="w-28">
                  <label className="text-[11px] font-semibold text-grove-text-muted uppercase tracking-wider block mb-1">Duration</label>
                  <select
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                               text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
                  >
                    {DURATION_OPTIONS.map(d => (
                      <option key={d.minutes} value={d.minutes} className="bg-grove-surface text-grove-text">{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-grove-text-muted uppercase tracking-wider block mb-1">Meeting Link</label>
                <input
                  type="url"
                  value={meetingLink}
                  onChange={e => setMeetingLink(e.target.value)}
                  placeholder="https://zoom.us/j/... or https://castalia.one/..."
                  className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                             text-grove-text placeholder:text-grove-text-dim
                             focus:outline-none focus:ring-1 focus:ring-grove-accent"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-grove-text-muted uppercase tracking-wider block mb-1">Recurrence</label>
                <select
                  value={recurrence}
                  onChange={e => setRecurrence(e.target.value)}
                  className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                             text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
                >
                  {RECURRENCE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value} className="bg-grove-surface text-grove-text">{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="w-full py-2.5 rounded-lg bg-grove-accent-deep text-grove-surface text-sm font-semibold
                         hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Event'}
            </button>
          </div>

          {/* Right column — Invitees + Scheduling */}
          <div className="flex-1 space-y-4">
            <div className="bg-grove-surface border border-grove-border rounded-xl p-5">
              <h2 className="text-[11px] font-semibold text-grove-text-muted uppercase tracking-wider mb-3">Invite People</h2>
              <InviteePicker selected={invitees} onChange={setInvitees} disabled={creating} />
            </div>

            <div className="bg-grove-surface border border-grove-border rounded-xl p-5">
              <SchedulingSuggestions
                inviteeIds={invitees.map(i => i.hyloId)}
                durationMinutes={duration}
                onSelect={handleSuggestionSelect}
              />
              {invitees.length === 0 && (
                <p className="text-xs text-grove-text-muted italic text-center py-4">
                  Add invitees above to see scheduling suggestions
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
