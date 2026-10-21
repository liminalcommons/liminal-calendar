'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { calendarSFX } from '@/lib/sound-manager';

const PREF_KEY = 'calendar-view-preference';

const VIEWS = [
  { label: 'Week', path: '/', pref: 'week' },
  { label: 'Month', path: '/month', pref: 'month' },
  { label: 'List', path: '/list', pref: 'list' },
  { label: 'Book', path: '/book', pref: 'book' },
] as const;

const CONFERENCE_VIEWS = [
  { label: '24h', path: 'upcoming', pref: 'conf-upcoming' },
  { label: 'List', path: 'list', pref: 'conf-list' },
  { label: 'Week', path: 'week', pref: 'conf-week' },
  { label: 'Month', path: 'month', pref: 'conf-month' },
] as const;

/**
 * View switcher. Without `base` it drives the permanent calendar; with a
 * conference base (e.g. `/c/limicon1`) it stays inside the conference and
 * gains the 24h view instead of Book.
 */
export function ViewToggle({ base = '' }: { base?: string }) {
  const pathname = usePathname();
  const views = base ? CONFERENCE_VIEWS : VIEWS;

  const hrefFor = (path: string) => (base ? `${base}/${path}` : path);
  const isActive = (path: string) => {
    const href = hrefFor(path);
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="flex items-center rounded-full border border-grove-border bg-grove-bg overflow-hidden">
      {views.map(({ label, path, pref }) => (
        <Link
          key={path}
          href={hrefFor(path)}
          onClick={() => {
            if (!isActive(path)) calendarSFX.play('scroll');
            // Persist explicit choice so MobileRedirect respects it on next load
            try { localStorage.setItem(PREF_KEY, pref); } catch { /* best effort */ }
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
