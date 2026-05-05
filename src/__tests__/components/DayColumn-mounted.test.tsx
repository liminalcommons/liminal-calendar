/**
 * DayColumn mount gate — proves the SSR/hydration TZ-flash fix.
 *
 * Without the gate, `renderToString(<DayColumn .../>)` produces HTML containing
 * EventBlock divs positioned using SSR's UTC clock — those blocks then snap to
 * the local-TZ row on hydration. The gate suppresses the SSR pass entirely so
 * event blocks only paint after the browser TZ is known.
 */

// jsdom is missing some web globals that react-dom/server.browser needs.
// Polyfill MessageChannel + TextEncoder/TextDecoder from Node before importing.
import { MessageChannel as NodeMessageChannel } from 'worker_threads';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';
const g = globalThis as { MessageChannel?: unknown; TextEncoder?: unknown; TextDecoder?: unknown };
if (typeof g.MessageChannel === 'undefined') g.MessageChannel = NodeMessageChannel;
if (typeof g.TextEncoder === 'undefined') g.TextEncoder = NodeTextEncoder;
if (typeof g.TextDecoder === 'undefined') g.TextDecoder = NodeTextDecoder;

import React from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { DayColumn } from '@/components/calendar/DayColumn';
import type { DisplayEvent } from '@/lib/display-event';

function mkEvent(id: string, starts: Date, ends: Date): DisplayEvent {
  return {
    id,
    title: `EVENT_${id}`,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    creator_id: 'u',
    creator_name: 'U',
    creator_image: null,
    description: null,
    imageUrl: null,
    location: null,
    event_url: null,
    recurrenceRule: null,
    attendees: { going: 0, interested: 0, total: 0 },
    myResponse: null,
  } as unknown as DisplayEvent;
}

const heights = new Array(48).fill(20);
const offsets = new Array(48).fill(0).map((_, i) => i * 20);

describe('DayColumn mount gate', () => {
  it('does not include event blocks in SSR output', () => {
    const day = new Date(2026, 4, 3);
    const ev = mkEvent('1', new Date(2026, 4, 3, 10, 0), new Date(2026, 4, 3, 11, 0));
    const html = renderToString(
      <DayColumn
        day={day}
        events={[ev]}
        isToday={false}
        hourHeights={heights}
        hourOffsets={offsets}
        dissolvingIds={new Set()}
        spawningIds={new Set()}
        onEventClick={() => {}}
      />,
    );
    expect(html).not.toContain('data-testid="event-block"');
    // Title shouldn't leak via renderToString either — the gate suppresses
    // the entire EventBlock subtree, not just the testid attribute.
    expect(html).not.toContain('EVENT_1');
  });

  it('renders event blocks after mount', async () => {
    const day = new Date(2026, 4, 3);
    const ev = mkEvent('1', new Date(2026, 4, 3, 10, 0), new Date(2026, 4, 3, 11, 0));
    render(
      <DayColumn
        day={day}
        events={[ev]}
        isToday={false}
        hourHeights={heights}
        hourOffsets={offsets}
        dissolvingIds={new Set()}
        spawningIds={new Set()}
        onEventClick={() => {}}
      />,
    );
    // After mount, EventBlock should be present (uses event.title in the title attr).
    expect(await screen.findByTitle('EVENT_1')).toBeInTheDocument();
  });
});
