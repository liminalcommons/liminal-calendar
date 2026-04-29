import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

const mockSignIn = jest.fn();

jest.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

import StartHyloSignInPage from '@/app/start-hylo-signin/page';

describe('StartHyloSignInPage', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mockSignIn.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  function setSearch(search: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        search,
        origin: 'https://auth.liminalcalendar.com',
      },
    });
  }

  it('calls signIn("hylo") with redirectTo from callbackUrl query param on mount', () => {
    setSearch('?callbackUrl=https%3A%2F%2Fliminalcalendar.com%2F');
    render(<StartHyloSignInPage />);

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith('hylo', {
      redirectTo: 'https://liminalcalendar.com/',
    });
  });

  it('defaults redirectTo to https://liminalcalendar.com/ when callbackUrl is missing', () => {
    setSearch('');
    render(<StartHyloSignInPage />);

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith('hylo', {
      redirectTo: 'https://liminalcalendar.com/',
    });
  });

  it('renders a redirecting indicator while signIn is in flight', () => {
    setSearch('?callbackUrl=https%3A%2F%2Fliminalcalendar.com%2F');
    render(<StartHyloSignInPage />);

    expect(screen.getByText(/redirecting/i)).toBeInTheDocument();
  });
});
