'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { calendarSFX } from '@/lib/sound-manager';

const PREF_KEY = 'calendar-view-preference';

const VIEWS = [
  { label: 'Week', path: '/', pref: 'week' },
  { label: 'Month', path: '/month', pref: 'month' },
  { label: 'List', path: '/list', pref: 'list' },
] as const;

export function ViewToggle() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <div className="flex items-center rounded-full border border-grove-border bg-grove-bg overflow-hidden">
      {VIEWS.map(({ label, path, pref }) => (
        <Link
          key={path}
          href={path}
          onClick={() => {
            if (!isActive(path)) calendarSFX.play('scroll');
            // Persist explicit choice so MobileRedirect respects it on next load
            try { localStorage.setItem(PREF_KEY, pref); } catch {}
          }}
          className={[
            'px-3 py-1 text-xs font-medium transition-colors',
            isActive(path)
              ? 'bg-grove-accent-deep text-grove-surface'
              : 'text-grove-text-muted hover:text-grove-text',
          ].join(' ')}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
