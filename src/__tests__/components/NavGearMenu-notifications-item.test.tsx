import { render, screen, fireEvent } from '@testing-library/react';
import { NavGearMenu } from '@/components/NavGearMenu';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));

describe('NavGearMenu', () => {
  it('contains a Notifications link', () => {
    render(<NavGearMenu isAdmin={false} onSignOut={() => {}} />);
    // Menu items live inside {open && ...}; click the gear button to open.
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('link', { name: /^notifications$/i })).toHaveAttribute(
      'href',
      '/settings/notifications',
    );
  });
});
