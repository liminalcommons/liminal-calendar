import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { EventBlock } from '@/components/calendar/EventBlock';
import type { DisplayEvent } from '@/lib/display-event';

/**
 * The gradient fallback can't be asserted through the DOM: jsdom's CSS parser
 * doesn't understand `linear-gradient(...)` and silently drops it from the
 * inline style. So these tests key on the two things that ARE observable and
 * that track the same branch — whether the <img> is rendered, and whether the
 * imageless treatment (the title initial) is shown.
 */

function mkEvent(over: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id: 'e1',
    title: 'Onboarding and feedback',
    creator_id: 'u',
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
    ...over,
  } as unknown as DisplayEvent;
}

const heights = new Array(48).fill(20);
const offsets = new Array(48).fill(0).map((_, i) => i * 20);

function renderBlock(event: DisplayEvent) {
  return render(
    <EventBlock
      event={event}
      colIndex={0}
      colTotal={1}
      hourHeights={heights}
      hourOffsets={offsets}
      onEventClick={() => {}}
    />,
  );
}

/** The decorative initial shown only when no image is displayed. */
function initial(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[aria-hidden="true"]');
}

describe('EventBlock — image handling', () => {
  it('renders no <img> and shows a title initial when the event has no image', () => {
    // This is the "Onboarding and feedback" case: imageUrl is null in the
    // database, so there is nothing to paint but the gradient.
    const { container } = renderBlock(mkEvent({ imageUrl: undefined }));
    expect(container.querySelector('img')).toBeNull();
    expect(initial(container)?.textContent).toBe('O');
  });

  it('renders the image and drops the initial when one is set', () => {
    const { container } = renderBlock(mkEvent({ imageUrl: 'https://cdn.example/a.png' }));
    expect(container.querySelector('img')).not.toBeNull();
    expect(initial(container)).toBeNull();
  });

  it('falls back to the imageless treatment when the image fails to load', () => {
    // Previously the gradient was skipped for any event carrying a URL and
    // there was no error handler, so a dead asset left a transparent hole in
    // the grid. Now a failed load re-renders down the no-image branch.
    const { container } = renderBlock(mkEvent({ imageUrl: 'https://cdn.example/gone.png' }));
    expect(container.querySelector('img')).not.toBeNull();

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(initial(container)?.textContent).toBe('O');
  });

  it('omits the initial on blocks too short to carry it', () => {
    const { container } = render(
      <EventBlock
        event={mkEvent({
          starts_at: new Date(2026, 4, 3, 10, 0).toISOString(),
          ends_at: new Date(2026, 4, 3, 10, 15).toISOString(),
        })}
        colIndex={0}
        colTotal={1}
        hourHeights={new Array(48).fill(6)}
        hourOffsets={new Array(48).fill(0).map((_, i) => i * 6)}
        onEventClick={() => {}}
      />,
    );
    expect(initial(container)).toBeNull();
  });

  it('uses the first letter of the title, uppercased', () => {
    const { container } = renderBlock(mkEvent({ title: 'stewards circle' }));
    expect(initial(container)?.textContent).toBe('S');
  });
});
