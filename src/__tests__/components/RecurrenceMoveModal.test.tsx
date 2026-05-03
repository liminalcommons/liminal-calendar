/**
 * RecurrenceMoveModal — three-option scope picker for recurring drag-drops.
 *
 * Per spec, v1 supports only the "all events" branch; the other two are
 * shown for visibility but disabled with a "coming soon" affordance. The
 * modal is the gate that prevents accidental whole-series moves — user
 * must explicitly pick "All events" to confirm.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecurrenceMoveModal } from '@/components/calendar/RecurrenceMoveModal';

describe('RecurrenceMoveModal', () => {
  function setup(overrides?: Partial<React.ComponentProps<typeof RecurrenceMoveModal>>) {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const result = render(
      <RecurrenceMoveModal
        isOpen
        eventTitle="Weekly Sync"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...overrides}
      />,
    );
    return { ...result, onConfirm, onCancel };
  }

  it('renders three radio options labeled this/following/all', () => {
    setup();
    expect(screen.getByLabelText(/this event only/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/this and following/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/all events/i)).toBeInTheDocument();
  });

  it('disables "this event only" and "this and following" in v1', () => {
    setup();
    expect(screen.getByLabelText(/this event only/i)).toBeDisabled();
    expect(screen.getByLabelText(/this and following/i)).toBeDisabled();
    expect(screen.getByLabelText(/all events/i)).not.toBeDisabled();
  });

  it('selects "all events" by default since it is the only enabled option', () => {
    setup();
    expect((screen.getByLabelText(/all events/i) as HTMLInputElement).checked).toBe(true);
  });

  it('confirms with scope="all" when user clicks Confirm', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: /confirm move/i }));
    expect(onConfirm).toHaveBeenCalledWith('all');
  });

  it('calls onCancel when Cancel button clicked', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when Escape key pressed', () => {
    const { onCancel } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <RecurrenceMoveModal
        isOpen={false}
        eventTitle="X"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('exposes role="dialog" and aria-modal="true" for assistive tech', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
  });

  it('shows the event title in the dialog heading', () => {
    setup({ eventTitle: 'Weekly Sync' });
    expect(screen.getByText(/Weekly Sync/i)).toBeInTheDocument();
  });
});
