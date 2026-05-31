import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

// next-auth/react ships untranspiled ESM (it imports react/jsx-runtime via an
// `import` statement) that jest does not transform under node_modules, so loading
// SignInChooser throws "Cannot use import statement outside a module". The
// component only consumes signIn(), so stub the module to keep this a pure
// render test.
jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

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
