import { clerkUserCreatedToSyncInput } from '@/lib/auth/clerk-event-to-sync-input';

// Build a minimal user.created event payload (Clerk shape).
function makeUserCreatedEvent(overrides: Partial<{
  id: string;
  emailAddresses: Array<{ id: string; email_address: string; verification?: { status: string } }>;
  primaryEmailAddressId: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
}> = {}) {
  return {
    type: 'user.created' as const,
    data: {
      id: overrides.id ?? 'user_default',
      email_addresses: overrides.emailAddresses ?? [],
      primary_email_address_id: overrides.primaryEmailAddressId ?? null,
      first_name: overrides.firstName ?? null,
      last_name: overrides.lastName ?? null,
      image_url: overrides.imageUrl ?? null,
    },
  };
}

describe('clerkUserCreatedToSyncInput', () => {
  it('returns null for unhandled event types', () => {
    // user.deleted has a different data shape and is intentionally
    // NOT handled by this mapper.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = { type: 'user.deleted', data: { id: 'x', deleted: true } } as any;
    expect(clerkUserCreatedToSyncInput(evt)).toBeNull();
  });

  it('returns null for non-user events', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = { type: 'session.created', data: { id: 's' } } as any;
    expect(clerkUserCreatedToSyncInput(evt)).toBeNull();
  });

  it('maps a user.updated event identically to user.created (drift propagation)', () => {
    // user.updated fires when a Clerk user changes their email, name,
    // or profile image. Mapper output is identical shape; the wrapper
    // (syncClerkMemberWithMerge → syncClerkMember) routes through the
    // conflict-update path that preserves role + feedToken.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = {
      type: 'user.updated' as const,
      data: {
        id: 'user_42',
        email_addresses: [
          { id: 'idn_1', email_address: 'newer@x.y', verification: { status: 'verified' } },
        ],
        primary_email_address_id: 'idn_1',
        first_name: 'Alice',
        last_name: 'Newname',
        image_url: 'https://img/new-avatar.png',
      },
    } as any;
    expect(clerkUserCreatedToSyncInput(evt)).toEqual({
      clerkId: 'user_42',
      name: 'Alice Newname',
      email: 'newer@x.y',
      image: 'https://img/new-avatar.png',
      emailVerified: true,
    });
  });

  it('maps a user.created event with verified primary email', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = makeUserCreatedEvent({
      id: 'user_42',
      emailAddresses: [
        { id: 'idn_1', email_address: 'a@x.y', verification: { status: 'verified' } },
      ],
      primaryEmailAddressId: 'idn_1',
      firstName: 'Alice',
      lastName: 'Doe',
      imageUrl: 'https://img/avatar.png',
    }) as any;

    const input = clerkUserCreatedToSyncInput(evt);
    expect(input).toEqual({
      clerkId: 'user_42',
      name: 'Alice Doe',
      email: 'a@x.y',
      image: 'https://img/avatar.png',
      emailVerified: true,
    });
  });

  it('maps emailVerified=false when primary email is unverified', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = makeUserCreatedEvent({
      id: 'user_unverified',
      emailAddresses: [
        { id: 'idn_1', email_address: 'm@x.y', verification: { status: 'unverified' } },
      ],
      primaryEmailAddressId: 'idn_1',
    }) as any;

    const input = clerkUserCreatedToSyncInput(evt);
    expect(input?.emailVerified).toBe(false);
    expect(input?.email).toBe('m@x.y');
  });

  it('maps emailVerified=false when verification field is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = makeUserCreatedEvent({
      emailAddresses: [{ id: 'idn_1', email_address: 'n@x.y' }],
      primaryEmailAddressId: 'idn_1',
    }) as any;

    const input = clerkUserCreatedToSyncInput(evt);
    expect(input?.emailVerified).toBe(false);
  });

  it('handles user with no email addresses', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = makeUserCreatedEvent({ id: 'user_no_email' }) as any;

    const input = clerkUserCreatedToSyncInput(evt);
    expect(input?.clerkId).toBe('user_no_email');
    expect(input?.email).toBeNull();
    expect(input?.emailVerified).toBe(false);
  });

  it('handles missing first/last name (returns null name)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = makeUserCreatedEvent({ id: 'u', firstName: null, lastName: null }) as any;
    const input = clerkUserCreatedToSyncInput(evt);
    expect(input?.name).toBeNull();
  });

  it('combines first and last names with a space', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = makeUserCreatedEvent({ id: 'u', firstName: 'Alice', lastName: 'Smith' }) as any;
    const input = clerkUserCreatedToSyncInput(evt);
    expect(input?.name).toBe('Alice Smith');
  });

  it('uses just first name when last name is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = makeUserCreatedEvent({ id: 'u', firstName: 'Alice', lastName: null }) as any;
    const input = clerkUserCreatedToSyncInput(evt);
    expect(input?.name).toBe('Alice');
  });

  it('falls back to the first email when primary_email_address_id does not match', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evt = makeUserCreatedEvent({
      id: 'u',
      emailAddresses: [
        { id: 'idn_a', email_address: 'first@x.y', verification: { status: 'verified' } },
      ],
      primaryEmailAddressId: 'idn_unknown',
    }) as any;
    const input = clerkUserCreatedToSyncInput(evt);
    expect(input?.email).toBe('first@x.y');
    // Verified status comes from the matched (fallback) email.
    expect(input?.emailVerified).toBe(true);
  });
});
