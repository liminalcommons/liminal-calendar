import { render, screen, waitFor } from '@testing-library/react';
import { SubscribePrompt } from '@/components/SubscribePrompt';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));
jest.mock('@/lib/use-feed-urls', () => ({
  useFeedUrls: () => ({ webcalUrl: 'webcal://x', googleUrl: 'https://g', outlookUrl: 'https://o' }),
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
    }),
  } as Response);
  localStorage.clear();
  // Force PushManager API present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PushManager = function () {};
  Object.defineProperty(window, 'Notification', {
    value: { permission: 'default', requestPermission: () => Promise.resolve('granted') },
    configurable: true,
  });
});

describe('SubscribePrompt notifications step', () => {
  it('renders the NotificationPreferences component on the notifications step', async () => {
    render(<SubscribePrompt />);
    await waitFor(() => screen.getByRole('heading', { name: /never miss/i }), { timeout: 3000 });
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    });
  });
});
