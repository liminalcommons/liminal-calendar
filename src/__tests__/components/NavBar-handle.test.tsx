/**
 * NavBar — handle display + avatar.
 */
import { render, screen } from '@testing-library/react';
import { NavBar } from '@/components/NavBar';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signOut: jest.fn(),
}));

jest.mock('@/components/providers/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'light', toggle: jest.fn() }),
}));

jest.mock('@/components/ViewToggle', () => ({ ViewToggle: () => null }));
jest.mock('@/components/NotificationButton', () => ({ NotificationButton: () => null }));
jest.mock('@/components/NavGearMenu', () => ({ NavGearMenu: () => null }));
jest.mock('@/components/RuneAccent', () => ({ RuneAccent: () => null }));

describe('NavBar handle display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders sign-in button when unauthenticated', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    render(<NavBar />);
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('renders avatar initials when authenticated', () => {
    mockUseSession.mockReturnValue({ data: { user: { name: 'Jane Doe', role: 'member' } }, status: 'authenticated' });
    render(<NavBar />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});
