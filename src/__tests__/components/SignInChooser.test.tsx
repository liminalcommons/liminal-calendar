import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { SignInChooser } from '@/components/auth/SignInChooser';

describe('SignInChooser', () => {
  it('renders both auth path options', () => {
    render(<SignInChooser />);
    expect(
      screen.getByRole('button', { name: /Sign in with Castalia/i }),
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
});
