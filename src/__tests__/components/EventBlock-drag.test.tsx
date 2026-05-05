import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { EventBlock } from '@/components/calendar/EventBlock';
import type { DisplayEvent } from '@/lib/display-event';

function mkEvent(creatorId: string): DisplayEvent {
  return {
    id: 'e1',
    title: 'E1',
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

describe('EventBlock owner-only drag affordance', () => {
  it('exposes data-draggable="true" when isOwner', () => {
    const { container } = render(
      <EventBlock
        event={mkEvent('me')}
        colIndex={0}
        colTotal={1}
        hourHeights={heights}
        hourOffsets={offsets}
        onEventClick={() => {}}
        isOwner
      />,
    );
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    expect(block).not.toBeNull();
    expect(block.getAttribute('data-draggable')).toBe('true');
  });

  it('exposes data-draggable="false" when NOT isOwner', () => {
    const { container } = render(
      <EventBlock
        event={mkEvent('someone-else')}
        colIndex={0}
        colTotal={1}
        hourHeights={heights}
        hourOffsets={offsets}
        onEventClick={() => {}}
        isOwner={false}
      />,
    );
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    expect(block).not.toBeNull();
    expect(block.getAttribute('data-draggable')).toBe('false');
  });

  it('defaults to data-draggable="false" when isOwner is omitted', () => {
    const { container } = render(
      <EventBlock
        event={mkEvent('me')}
        colIndex={0}
        colTotal={1}
        hourHeights={heights}
        hourOffsets={offsets}
        onEventClick={() => {}}
      />,
    );
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    expect(block.getAttribute('data-draggable')).toBe('false');
  });

  it('does NOT call onDragStart for non-owner pointerdown (defense in depth)', () => {
    // Even if a future bug links pointerdown wiring incorrectly, the non-owner
    // path must produce zero drag activation. This test guards the consequence
    // of isOwner=false, not just the marker.
    const onDragStart = jest.fn();
    const { container } = render(
      <EventBlock
        event={mkEvent('someone-else')}
        colIndex={0}
        colTotal={1}
        hourHeights={heights}
        hourOffsets={offsets}
        onEventClick={() => {}}
        isOwner={false}
        onDragStart={onDragStart}
      />,
    );
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    fireEvent.pointerDown(block, { clientX: 50, clientY: 100, pointerId: 1 });
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('DOES call onDragStart for owner pointerdown', () => {
    const onDragStart = jest.fn();
    const { container } = render(
      <EventBlock
        event={mkEvent('me')}
        colIndex={0}
        colTotal={1}
        hourHeights={heights}
        hourOffsets={offsets}
        onEventClick={() => {}}
        isOwner
        onDragStart={onDragStart}
      />,
    );
    const block = container.querySelector('[data-testid="event-block"]') as HTMLElement;
    fireEvent.pointerDown(block, { clientX: 50, clientY: 100, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });
});
