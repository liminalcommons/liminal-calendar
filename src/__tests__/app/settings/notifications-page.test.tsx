import { render, screen } from '@testing-library/react';
import Page from '@/app/settings/notifications/page';

jest.mock('@/components/NotificationPreferences', () => ({
  NotificationPreferences: () => <div data-testid="prefs" />,
}));
jest.mock('@/app/settings/notifications/RsvpedEventsList', () => ({
  RsvpedEventsList: () => <div data-testid="rsvps" />,
}));

describe('Settings → Notifications page', () => {
  it('renders the heading, prefs, and rsvped events list', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByTestId('prefs')).toBeInTheDocument();
    expect(screen.getByTestId('rsvps')).toBeInTheDocument();
  });
});
