import { renderHook, act } from '@testing-library/react';
import { useRsvpMutation } from '@/lib/rsvp/use-rsvp-mutation';

// Mock apiFetch so we can observe POST calls without a network.
jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/lib/api-fetch';

describe('useRsvpMutation', () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it('POSTs to /api/events/:id/rsvp with response + remindMe', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    const { result } = renderHook(() => useRsvpMutation('42'));

    await act(async () => {
      const out = await result.current.submit({ response: 'yes', remindMe: true });
      expect(out).toEqual({ ok: true, status: 200 });
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (apiFetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/events/42/rsvp');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ response: 'yes', remindMe: true });
  });

  it('omits remindMe from the body when caller does not pass it', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    const { result } = renderHook(() => useRsvpMutation('7'));
    await act(async () => {
      await result.current.submit({ response: 'no' });
    });
    const [, init] = (apiFetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ response: 'no' });
  });

  it('returns ok=false with status on non-2xx responses', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
    const { result } = renderHook(() => useRsvpMutation('9'));
    const out = await act(async () => result.current.submit({ response: 'yes' }));
    expect(out).toEqual({ ok: false, status: 401 });
  });

  it('returns ok=false when apiFetch throws (network error)', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useRsvpMutation('3'));
    const out = await act(async () => result.current.submit({ response: 'interested' }));
    expect(out).toEqual({ ok: false, status: 0 });
  });

  it('pending flips true during the request and false after', async () => {
    let resolveFetch!: (v: unknown) => void;
    (apiFetch as jest.Mock).mockImplementation(
      () => new Promise((r) => { resolveFetch = r; }),
    );
    const { result } = renderHook(() => useRsvpMutation('1'));
    let submitPromise!: Promise<unknown>;
    act(() => {
      submitPromise = result.current.submit({ response: 'yes' });
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      resolveFetch({ ok: true, status: 200 });
      await submitPromise;
    });
    expect(result.current.pending).toBe(false);
  });
});
