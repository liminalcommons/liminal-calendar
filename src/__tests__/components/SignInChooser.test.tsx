import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';

// next-auth/react ships untranspiled ESM (it imports react/jsx-runtime via an
// `import` statement) that jest does not transform under node_modules, so loading
// SignInChooser throws "Cannot use import statement outside a module". The
// component only consumes signIn(), so stub the module to keep this a pure
// render test.
const mockSignIn = jest.fn();
jest.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

import { SignInChooser } from '@/components/auth/SignInChooser';

describe('SignInChooser', () => {
  beforeEach(() => mockSignIn.mockClear());

  it('renders the single Castalia sign-in option', () => {
    render(<SignInChooser />);
    expect(
      screen.getByRole('button', { name: /Sign in with Castalia/i }),
    ).toBeInTheDocument();
  });

  it('starts the Logto OAuth flow on click', () => {
    render(<SignInChooser />);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with Castalia/i }));
    expect(mockSignIn).toHaveBeenCalledWith(
      'logto',
      { callbackUrl: `${window.location.origin}/` },
    );
  });
});
