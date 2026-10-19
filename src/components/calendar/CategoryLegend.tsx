'use client';

import { EVENT_CATEGORIES } from '@/lib/events/categories';

/** Category colour key for month/week conference views. */
export function CategoryLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-[11px] text-grove-text-muted">
      {EVENT_CATEGORIES.map((c) => (
        <span key={c.value} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: c.dot }}
          />
          {c.shortLabel}
        </span>
      ))}
      <span className="italic">Uncategorised events keep their own colours.</span>
    </div>
  );
}
