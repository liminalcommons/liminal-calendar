'use client';

import React from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import type { DisplayEvent } from '@/lib/display-event';

const EVENT_DOT_COLORS = [
  'bg-[#7a8b6a]', // forest green
  'bg-[#c4935a]', // warm brown
  'bg-[#6a7f8b]', // slate blue
  'bg-[#8b6a7f]', // plum
  'bg-[#8b836a]', // olive
  'bg-[#6a8b80]', // teal
];

function hashId(id: string): number {
  const baseId = id.replace(/-\d{8}$/, '');
  let h = 0;
  for (let i = 0; i < baseId.length; i++) {
    h = (h * 31 + baseId.charCodeAt(i)) >>> 0;
  }
  return h % 6;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`;
}

interface AgendaSidebarProps {
  events: DisplayEvent[];
  weekDays: Date[];
  onEventClick?: (event: DisplayEvent, rect: DOMRect) => void;
}

export function AgendaSidebar({ events, weekDays, onEventClick }: AgendaSidebarProps) {
  // Filter events to this week and group by day
  const dayGroups: { day: Date; events: DisplayEvent[] }[] = weekDays.map(day => ({
    day,
    events: events
      .filter(e => isSameDay(parseISO(e.starts_at), day))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
  }));

  const totalEvents = dayGroups.reduce((s, g) => s + g.events.length, 0);

  return (
    <div className="w-56 flex-shrink-0 border-l border-grove-border bg-grove-surface flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-grove-border flex-shrink-0">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-grove-text-muted">
          This Week
        </h3>
        <p className="text-[9px] text-grove-text-dim">{totalEvents} event{totalEvents !== 1 ? 's' : ''}</p>
      </div>

      {/* Scrollable event list */}
      <div className="flex-1 overflow-y-auto">
        {totalEvents === 0 ? (
          <p className="text-xs text-grove-text-dim italic px-3 py-4 text-center">No events this week</p>
        ) : (
          dayGroups.map(({ day, events: dayEvents }, i) => {
            if (dayEvents.length === 0) return null;
            const isToday = isSameDay(day, new Date());

            return (
              <div key={i} className="border-b border-grove-border/50 last:border-b-0">
                {/* Day label */}
                <div className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider sticky top-0 z-10 ${
                  isToday
                    ? 'text-grove-accent bg-grove-accent/8'
                    : 'text-grove-text-muted bg-grove-surface'
                }`}>
                  {isToday ? 'Today' : format(day, 'EEE')} &middot; {format(day, 'MMM d')}
                </div>

                {/* Events */}
                {dayEvents.map(event => {
                  const dotColor = EVENT_DOT_COLORS[hashId(event.id)];
                  return (
                    <button
                      key={event.id}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onEventClick?.(event, rect);
                      }}
                      className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-grove-border/20 transition-colors group"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${dotColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-grove-text truncate group-hover:text-grove-accent transition-colors">
                          {event.title}
                        </p>
                        <p className="text-[9px] text-grove-text-dim">
                          {formatTime(event.starts_at)}
                          {event.ends_at && ` – ${formatTime(event.ends_at)}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
