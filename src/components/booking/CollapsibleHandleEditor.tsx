'use client';

/**
 * CollapsibleHandleEditor — a "Change handle" affordance that hides
 * the HandleEditor by default. Once the handle is auto-claimed there
 * is no reason to surface an entire form section on every page load.
 * Users who want a different slug can expand the editor on demand.
 */

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { HandleEditor } from './HandleEditor';

interface Props {
  initialHandle: string;
}

export function CollapsibleHandleEditor({ initialHandle }: Props) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-grove-text-muted hover:text-grove-text transition-colors"
      >
        <Pencil size={11} aria-hidden="true" />
        Change handle
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded border border-grove-border bg-grove-surface p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-grove-text-muted">
          Picking a new slug changes your public booking URL.
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-grove-text-muted hover:text-grove-text"
        >
          Cancel
        </button>
      </div>
      <HandleEditor initialHandle={initialHandle} />
    </div>
  );
}
