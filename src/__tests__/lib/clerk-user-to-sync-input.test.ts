import { clerkUserToSyncInput } from '@/lib/auth/clerk-user-to-sync-input';

describe('clerkUserToSyncInput', () => {
  it('maps verified primary email + names', () => {
    const input = clerkUserToSyncInput({
      id: 'clerk_x',
      firstName: 'Florin',
      lastName: 'Test',
      imageUrl: 'https://img/x.png',
      primaryEmailAddressId: 'e_1',
      emailAddresses: [
        { id: 'e_1', emailAddress: 'florin@example.com', verification: { status: 'verified' } },
      ],
    });
    expect(input).toEqual({
      clerkId: 'clerk_x',
      name: 'Florin Test',
      email: 'florin@example.com',
      image: 'https://img/x.png',
      emailVerified: true,
    });
  });

  it('reports emailVerified=false when verification.status is not verified', () => {
    const input = clerkUserToSyncInput({
      id: 'clerk_unv',
      firstName: 'A',
      lastName: null,
      imageUrl: '',
      primaryEmailAddressId: 'e_p',
      emailAddresses: [
        { id: 'e_p', emailAddress: 'p@example.com', verification: { status: 'unverified' } },
      ],
    });
    expect(input.emailVerified).toBe(false);
    expect(input.email).toBe('p@example.com');
    expect(input.name).toBe('A');
  });

  it('picks the primary email when multiple are present', () => {
    const input = clerkUserToSyncInput({
      id: 'clerk_m',
      firstName: null,
      lastName: null,
      imageUrl: '',
      primaryEmailAddressId: 'e_2',
      emailAddresses: [
        { id: 'e_1', emailAddress: 'first@example.com', verification: { status: 'verified' } },
        { id: 'e_2', emailAddress: 'primary@example.com', verification: { status: 'verified' } },
      ],
    });
    expect(input.email).toBe('primary@example.com');
    expect(input.name).toBeNull();
  });

  it('falls back to first email when primaryEmailAddressId is null', () => {
    const input = clerkUserToSyncInput({
      id: 'clerk_np',
      firstName: 'Z',
      lastName: 'Y',
      imageUrl: '',
      primaryEmailAddressId: null,
      emailAddresses: [
        { id: 'e_a', emailAddress: 'only@example.com', verification: { status: 'verified' } },
      ],
    });
    expect(input.email).toBe('only@example.com');
    expect(input.name).toBe('Z Y');
  });

  it('returns null email when no email addresses are present', () => {
    const input = clerkUserToSyncInput({
      id: 'clerk_no_email',
      firstName: null,
      lastName: null,
      imageUrl: '',
      primaryEmailAddressId: null,
      emailAddresses: [],
    });
    expect(input.email).toBeNull();
    expect(input.emailVerified).toBe(false);
    expect(input.name).toBeNull();
    expect(input.image).toBeNull();
  });

  it('returns null image when imageUrl is empty', () => {
    const input = clerkUserToSyncInput({
      id: 'clerk_no_img',
      firstName: 'X',
      lastName: null,
      imageUrl: '',
      primaryEmailAddressId: 'e_1',
      emailAddresses: [
        { id: 'e_1', emailAddress: 'x@example.com', verification: { status: 'verified' } },
      ],
    });
    expect(input.image).toBeNull();
  });
});
