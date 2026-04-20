'use client';

interface DeleteConfirmProps {
  isRecurring: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The delete-confirmation footer shown inside EventExpansion. Two shapes:
 * one for recurring events (labels the scope as "All occurrences") and one
 * for single events. Kept as its own component so the popover parent stays
 * focused on state wiring.
 */
export function DeleteConfirm({ isRecurring, isDeleting, onConfirm, onCancel }: DeleteConfirmProps) {
  if (isRecurring) {
    return (
      <div className="px-4 pb-4 border-t border-grove-border/40 pt-3">
        <p className="text-xs text-grove-text-muted mb-2">
          This is a recurring event. What do you want to delete?
        </p>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full text-xs py-1.5 rounded-md bg-red-500/80 hover:bg-red-500 text-white border border-red-500/60 transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'All occurrences'}
          </button>
          <button
            onClick={onCancel}
            className="w-full text-xs py-1.5 rounded-md border border-grove-border text-grove-text-muted hover:text-grove-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 border-t border-grove-border/40 pt-3">
      <p className="text-xs text-grove-text-muted mb-2">Delete this event? This cannot be undone.</p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="flex-1 text-xs py-1.5 rounded-md bg-red-500/80 hover:bg-red-500 text-white border border-red-500/60 transition-colors disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Yes, delete'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 text-xs py-1.5 rounded-md border border-grove-border text-grove-text-muted hover:text-grove-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
