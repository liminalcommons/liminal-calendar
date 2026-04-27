import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { SignInChooser } from '@/components/auth/SignInChooser';

describe('SignInChooser', () => {
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

  it('Hylo button is clickable and triggers gateway redirect', () => {
    const originalLocation = window.location;
    const hrefSetter = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get origin() {
          return 'http://localhost:3000';
        },
        set href(v: string) {
          hrefSetter(v);
        },
      },
    });

    render(<SignInChooser />);
    const hyloBtn = screen.getByRole('button', {
      name: /Continue with Liminal Commons \(Hylo\)/i,
    });
    hyloBtn.click();

    expect(hrefSetter).toHaveBeenCalledTimes(1);
    expect(hrefSetter.mock.calls[0][0]).toMatch(/auth\.castalia\.one\/signin\?callbackUrl=/);
    expect(hrefSetter.mock.calls[0][0]).toMatch(/http%3A%2F%2Flocalhost%3A3000/);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});
