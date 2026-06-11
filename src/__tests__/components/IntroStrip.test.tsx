import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntroStrip } from '@/components/IntroStrip';

const COOKIE = 'liminal_intro_dismissed';

describe('IntroStrip', () => {
  afterEach(() => {
    document.cookie = `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });

  it('shows for non-members and links to /about', () => {
    render(<IntroStrip show={true} />);
    expect(screen.getByTestId('intro-strip')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read more/i })).toHaveAttribute(
      'href',
      '/about',
    );
  });

  it('does not render when show=false (members)', () => {
    render(<IntroStrip show={false} />);
    expect(screen.queryByTestId('intro-strip')).not.toBeInTheDocument();
  });

  it('dismisses persistently via cookie', () => {
    const { unmount } = render(<IntroStrip show={true} />);
    fireEvent.click(screen.getByLabelText(/Dismiss introduction/i));
    expect(screen.queryByTestId('intro-strip')).not.toBeInTheDocument();
    expect(document.cookie).toContain(`${COOKIE}=1`);
    unmount();
    render(<IntroStrip show={true} />);
    expect(screen.queryByTestId('intro-strip')).not.toBeInTheDocument();
  });
});
