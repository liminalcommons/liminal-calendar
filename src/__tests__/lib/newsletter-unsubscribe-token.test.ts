/**
 * @jest-environment node
 */

// The token module reads the signing secret at call time, so set it before import.
process.env.STOP_TOKEN_SECRET = 'test-secret-for-unsubscribe-tokens';

import {
  unsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
} from '@/lib/newsletter/unsubscribe-token';

describe('newsletter unsubscribe tokens', () => {
  it('verifies a token it generated', () => {
    const email = 'user@example.com';
    const token = unsubscribeToken(email);
    expect(verifyUnsubscribeToken(email, token)).toBe(true);
  });

  it('is case-insensitive on the email', () => {
    const token = unsubscribeToken('User@Example.com');
    expect(verifyUnsubscribeToken('user@example.com', token)).toBe(true);
  });

  it('rejects a forged or mismatched token', () => {
    const token = unsubscribeToken('user@example.com');
    expect(verifyUnsubscribeToken('other@example.com', token)).toBe(false);
    expect(verifyUnsubscribeToken('user@example.com', 'deadbeef')).toBe(false);
    expect(verifyUnsubscribeToken('user@example.com', '')).toBe(false);
  });

  it('embeds email and token in the unsubscribe URL', () => {
    const url = unsubscribeUrl('user@example.com');
    expect(url).toContain('/api/newsletter/unsubscribe');
    expect(url).toContain('e=user%40example.com');
    expect(url).toContain(`t=${unsubscribeToken('user@example.com')}`);
  });
});
