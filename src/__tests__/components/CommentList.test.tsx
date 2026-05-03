import { render, screen } from '@testing-library/react';
import { CommentList, type CommentRow } from '@/components/comments/CommentList';

const sample: CommentRow[] = [
  {
    id: 1,
    authorId: 'u-1',
    authorName: 'Alice',
    authorImage: null,
    body: 'looking forward to this',
    createdAt: '2026-05-02T10:00:00Z',
  },
  {
    id: 2,
    authorId: 'u-2',
    authorName: 'Bob',
    authorImage: 'avatar.png',
    body: 'me too',
    createdAt: '2026-05-02T11:00:00Z',
  },
];

describe('<CommentList>', () => {
  it('renders nothing visible (empty state) when comments is empty', () => {
    render(<CommentList comments={[]} />);
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });

  it('renders one row per comment with author name and body', () => {
    render(<CommentList comments={sample} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('looking forward to this')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('me too')).toBeInTheDocument();
  });

  it('renders an <img> when authorImage is set, initials otherwise', () => {
    render(<CommentList comments={sample} />);
    const img = screen.getByAltText('Bob') as HTMLImageElement;
    expect(img.src).toContain('avatar.png');
    // Alice has no image — should fall back to initials "AL"
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('shows delete button for the current user own comment when canDelete=true', () => {
    const onDelete = jest.fn();
    render(
      <CommentList
        comments={sample}
        currentUserId="u-1"
        onDelete={onDelete}
      />,
    );
    // Alice (u-1) is current user → delete button visible for her row only.
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons).toHaveLength(1);
  });

  it('shows delete button for ALL comments when isAdmin=true', () => {
    const onDelete = jest.fn();
    render(
      <CommentList
        comments={sample}
        currentUserId="u-99"
        isAdmin
        onDelete={onDelete}
      />,
    );
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons).toHaveLength(2);
  });

  it('calls onDelete with comment id when delete is clicked', () => {
    const onDelete = jest.fn();
    render(
      <CommentList
        comments={sample}
        currentUserId="u-1"
        onDelete={onDelete}
      />,
    );
    const button = screen.getByRole('button', { name: /delete/i });
    button.click();
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
