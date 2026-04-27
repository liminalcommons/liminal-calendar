import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { SignInChooser } from '@/components/auth/SignInChooser';

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

import { signIn } from 'next-auth/react';
const mockSignIn = signIn as jest.Mock;

describe('SignInChooser', () => {
  beforeEach(() => mockSignIn.mockReset());

  it('renders both auth path options', () => {
    render(<SignInChooser />);
    expect(
      screen.getByRole('button', { name: /Continue with Liminal Commons \(Hylo\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Continue with email or Google/i }),
    ).toBeInTheDocument();
  });

  it('Clerk path link points to /sign-in', () => {
    render(<SignInChooser />);
    const clerkLink = screen.getByRole('link', {
      name: /Continue with email or Google/i,
    });
    expect(clerkLink).toHaveAttribute('href', '/sign-in');
  });

  it('Hylo button calls NextAuth signIn with provider id and callbackUrl', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get origin() {
          return 'http://localhost:3000';
        },
      },
    });

    render(<SignInChooser />);
    const hyloBtn = screen.getByRole('button', {
      name: /Continue with Liminal Commons \(Hylo\)/i,
    });
    hyloBtn.click();

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith('hylo', {
      callbackUrl: 'http://localhost:3000',
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});
