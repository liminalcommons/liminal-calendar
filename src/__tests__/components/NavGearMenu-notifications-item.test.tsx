import { render, screen } from '@testing-library/react';
import { NavGearMenu } from '@/components/NavGearMenu';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));

describe('NavGearMenu', () => {
  it('contains a Notifications link', () => {
    render(<NavGearMenu />);
    expect(screen.getByRole('link', { name: /notifications/i })).toHaveAttribute(
      'href',
      '/settings/notifications',
    );
  });
});
