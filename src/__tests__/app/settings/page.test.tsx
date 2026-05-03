import { render, screen } from '@testing-library/react';
import Page from '@/app/settings/page';

jest.mock('@/components/NotificationPreferences', () => ({
  NotificationPreferences: () => <div data-testid="prefs" />,
}));
jest.mock('@/app/settings/RsvpedEventsList', () => ({
  RsvpedEventsList: () => <div data-testid="rsvps" />,
}));

describe('Settings page', () => {
  it('renders the Settings heading, prefs, and rsvped events list', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByTestId('prefs')).toBeInTheDocument();
    expect(screen.getByTestId('rsvps')).toBeInTheDocument();
  });

  it('renders a back link to the calendar root', () => {
    render(<Page />);
    const back = screen.getByRole('link', { name: /back to calendar/i });
    expect(back).toHaveAttribute('href', '/');
  });
});
