/**
 * DayColumn → EventBlock isOwner wiring.
 *
 * The drag affordance must light up only on events the current user created.
 * DayColumn computes `isOwner` from a new `currentUserId` prop and forwards
 * it (and an `onEventDragStart` callback) to each EventBlock. WeeklyGrid is
 * the source of `currentUserId` (from the session).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { DayColumn } from '@/components/calendar/DayColumn';
import type { DisplayEvent } from '@/lib/display-event';

function mkEvent(id: string, creatorId: string): DisplayEvent {
  return {
    id,
    title: `EVENT_${id}`,
    creator_id: creatorId,
    creator_name: 'U',
    creator_image: null,
    starts_at: new Date(2026, 4, 3, 10, 0).toISOString(),
    ends_at: new Date(2026, 4, 3, 11, 0).toISOString(),
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

async function renderColumn(currentUserId: string | null, events: DisplayEvent[]) {
  const day = new Date(2026, 4, 3);
  const out = render(
    <DayColumn
      day={day}
      events={events}
      isToday={false}
      hourHeights={heights}
      hourOffsets={offsets}
      dissolvingIds={new Set()}
      spawningIds={new Set()}
      onEventClick={() => {}}
      currentUserId={currentUserId}
    />,
  );
  // wait for mount gate
  await screen.findByTitle(events[0].title);
  return out;
}

describe('DayColumn isOwner wiring', () => {
  it('marks owner event as data-draggable="true" when currentUserId matches creator_id', async () => {
    const ev = mkEvent('1', 'me');
    const { container } = await renderColumn('me', [ev]);
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    expect(block.getAttribute('data-draggable')).toBe('true');
  });

  it('marks non-owner event as data-draggable="false"', async () => {
    const ev = mkEvent('1', 'someone-else');
    const { container } = await renderColumn('me', [ev]);
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    expect(block.getAttribute('data-draggable')).toBe('false');
  });

  it('marks all blocks as data-draggable="false" when currentUserId is null (unauth)', async () => {
    const ev = mkEvent('1', 'someone');
    const { container } = await renderColumn(null, [ev]);
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    expect(block.getAttribute('data-draggable')).toBe('false');
  });

  it('compares currentUserId stringwise (creator_id stored as numeric string)', async () => {
    // Provider IDs are strings; session may surface them as numbers in
    // some shapes. DayColumn must coerce to string for the comparison.
    const ev = mkEvent('1', '67402');
    const { container } = await renderColumn('67402', [ev]);
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    expect(block.getAttribute('data-draggable')).toBe('true');
  });
});
