import { render, screen, act } from '@testing-library/react';
import { InstallPrompt } from '@/components/InstallPrompt';

const ORIGINAL_UA = window.navigator.userAgent;

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

// jsdom doesn't provide window.matchMedia. Stub it so InstallPrompt.tsx
// line 22 (`window.matchMedia('(display-mode: standalone)').matches`)
// doesn't throw during test renders.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

afterEach(() => {
  setUA(ORIGINAL_UA);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window.navigator as any).standalone;
  localStorage.clear();
});

describe('InstallPrompt iOS branch', () => {
  it('shows iOS-specific instructions on iPhone Safari not in standalone mode', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari/605.1');
    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
    await act(async () => {
      render(<InstallPrompt />);
    });
    // Anchored regex — the iOS card has "Add to Home Screen" as both the heading
    // AND in the third instruction list item (".../Add to Home Screen"...). Anchor to
    // match the heading specifically.
    expect(await screen.findByText(/^Add to Home Screen$/i)).toBeInTheDocument();
    expect(screen.getByText(/Tap the Share button/i)).toBeInTheDocument();
  });

  it('does not show iOS card when in standalone mode', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari/605.1');
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    render(<InstallPrompt />);
    expect(screen.queryByText(/^Add to Home Screen$/i)).not.toBeInTheDocument();
  });

  it('does not show iOS card on desktop Chrome', async () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
    render(<InstallPrompt />);
    expect(screen.queryByText(/^Add to Home Screen$/i)).not.toBeInTheDocument();
  });
});
