import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecurrenceSelector } from '@/components/events/RecurrenceSelector';

describe('RecurrenceSelector', () => {
  it('emits every_N_weeks when switching to the custom-interval mode', () => {
    const onChange = jest.fn();
    render(<RecurrenceSelector value="none" onChange={onChange} />);

    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'every_n_weeks' },
    });
    // Default weeks is 4 — matches the "every four weeks" ask from product.
    expect(onChange).toHaveBeenLastCalledWith('every_4_weeks', 'never', undefined, undefined);
  });

  it('changing the week count re-emits the encoded rule', () => {
    const onChange = jest.fn();
    const { rerender } = render(<RecurrenceSelector value="every_4_weeks" onChange={onChange} />);

    const numberInput = screen.getByDisplayValue('4');
    fireEvent.change(numberInput, { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith('every_6_weeks', 'never', undefined, undefined);

    // Simulate the parent applying the change back down as a prop.
    rerender(<RecurrenceSelector value="every_6_weeks" onChange={onChange} />);
    expect(screen.getByDisplayValue('6')).toBeInTheDocument();
  });

  it('emits monthly_-1_thu for "last Thursday of the month"', () => {
    const onChange = jest.fn();
    // Fully controlled: the component only shows sub-fields for the mode
    // encoded in `value`, so simulate the parent feeding the change back
    // down (as EventForm's onChange -> setRecurrence -> re-render does).
    const { rerender } = render(<RecurrenceSelector value="none" onChange={onChange} />);

    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'monthly_nth_weekday' },
    });
    // Defaults to Last + Thursday.
    expect(onChange).toHaveBeenLastCalledWith('monthly_-1_thu', 'never', undefined, undefined);
    rerender(<RecurrenceSelector value="monthly_-1_thu" onChange={onChange} />);

    // combobox order: frequency mode, position ("Last"), weekday ("Thursday").
    const weekdaySelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(weekdaySelect, { target: { value: 'mon' } });
    expect(onChange).toHaveBeenLastCalledWith('monthly_-1_mon', 'never', undefined, undefined);
  });

  it('reflects an externally-set value (e.g. after an async edit-mode fetch)', () => {
    const onChange = jest.fn();
    const { rerender } = render(<RecurrenceSelector value="none" onChange={onChange} />);
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('none');

    // EventForm's edit-mode flow calls setRecurrence(event.recurrenceRule) after
    // an async fetch completes, well after this component already mounted.
    rerender(<RecurrenceSelector value="monthly_-1_thu" onChange={onChange} />);
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('monthly_nth_weekday');
    expect(screen.getByDisplayValue('Last')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Thursday')).toBeInTheDocument();
  });

  it('reverts to "none" and stops rendering sub-fields', () => {
    const onChange = jest.fn();
    render(<RecurrenceSelector value="every_4_weeks" onChange={onChange} />);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'none' } });
    expect(onChange).toHaveBeenLastCalledWith('none');
  });
});
