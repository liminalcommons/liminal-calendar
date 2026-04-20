import { resolveRole, resolveSessionRole } from '@/lib/auth/role';

describe('resolveRole', () => {
  const base = {
    hyloId: '123',
    isLiminalCommonsMember: true,
    hasModeratorRole: false,
    adminAllowlist: [] as string[],
  };

  it('returns undefined for non-members (to be blocked upstream)', () => {
    expect(resolveRole({ ...base, isLiminalCommonsMember: false })).toBeUndefined();
  });

  it('returns "admin" when the Hylo id is in the allowlist', () => {
    expect(resolveRole({ ...base, adminAllowlist: ['123'] })).toBe('admin');
  });

  it('returns "host" for group moderators not in the allowlist', () => {
    expect(resolveRole({ ...base, hasModeratorRole: true })).toBe('host');
  });

  it('returns "member" for plain group members', () => {
    expect(resolveRole(base)).toBe('member');
  });

  it('allowlist beats moderator: admin + moderator → admin', () => {
    expect(
      resolveRole({ ...base, adminAllowlist: ['123'], hasModeratorRole: true }),
    ).toBe('admin');
  });

  it('non-member with admin id still returns undefined (not a member of the group)', () => {
    expect(
      resolveRole({
        ...base,
        isLiminalCommonsMember: false,
        adminAllowlist: ['123'],
      }),
    ).toBeUndefined();
  });
});

describe('resolveSessionRole', () => {
  it('DB role takes precedence over allowlist + token role', () => {
    expect(
      resolveSessionRole({
        hyloId: '123',
        dbRole: 'member',
        tokenRole: 'admin',
        adminAllowlist: ['123'],
      }),
    ).toBe('member');
  });

  it('falls back to allowlist-derived admin when DB role is missing', () => {
    expect(
      resolveSessionRole({
        hyloId: '123',
        dbRole: undefined,
        tokenRole: 'member',
        adminAllowlist: ['123'],
      }),
    ).toBe('admin');
  });

  it('falls back to token role when DB is missing and user is not in allowlist', () => {
    expect(
      resolveSessionRole({
        hyloId: '999',
        dbRole: undefined,
        tokenRole: 'host',
        adminAllowlist: ['123'],
      }),
    ).toBe('host');
  });

  it('final fallback is "member"', () => {
    expect(
      resolveSessionRole({
        hyloId: undefined,
        dbRole: undefined,
        tokenRole: undefined,
        adminAllowlist: [],
      }),
    ).toBe('member');
  });
});
