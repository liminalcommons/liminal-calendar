import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

// LiminalWebBackdrop drives a canvas/RAF animation that jsdom can't run; this
// is a copy-render test so stub it to a noop element.
jest.mock('@/components/LiminalWebBackdrop', () => ({
  LiminalWebBackdrop: () => <div data-testid="backdrop-stub" />,
}));

import { MarketingLanding } from '@/components/MarketingLanding';

describe('MarketingLanding — Chrome fix banner (time-boxed)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows Roger\'s Chrome reset steps before the expiry date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-10T12:00:00Z'));
    render(<MarketingLanding />);
    expect(screen.getByTestId('chrome-fix-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/Restore settings to their original defaults/i),
    ).toBeInTheDocument();
  });

  it('self-retires the banner after the expiry date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T12:00:00Z'));
    render(<MarketingLanding />);
    expect(screen.queryByTestId('chrome-fix-banner')).not.toBeInTheDocument();
  });
});
