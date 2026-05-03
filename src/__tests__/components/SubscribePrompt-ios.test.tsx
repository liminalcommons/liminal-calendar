import { render, screen, waitFor } from '@testing-library/react';
import { SubscribePrompt } from '@/components/SubscribePrompt';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));
jest.mock('@/lib/use-feed-urls', () => ({
  useFeedUrls: () => ({ webcalUrl: 'webcal://x', googleUrl: 'https://g', outlookUrl: 'https://o' }),
}));
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
    emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
  }),
}) as unknown as typeof fetch;

beforeEach(() => {
  // Force PushManager + Notification permission=default so SubscribePrompt's
  // useEffect chooses the 'notifications' step (not 'subscribe').
  // Same stub pattern as SubscribePrompt-prefs.test.tsx.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PushManager = function () {};
  Object.defineProperty(window, 'Notification', {
    value: { permission: 'default', requestPermission: () => Promise.resolve('granted') },
    configurable: true,
  });
  localStorage.clear();
});

function setIOS() {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari/605.1',
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
}

describe('SubscribePrompt iOS guard', () => {
  it('shows install instructions instead of Enable button on iOS Safari not standalone', async () => {
    setIOS();
    render(<SubscribePrompt />);
    await waitFor(() => screen.getByRole('heading', { name: /never miss/i }), { timeout: 3000 });
    expect(screen.getByText(/Install app first/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Enable notifications$/i })).not.toBeInTheDocument();
  });
});
