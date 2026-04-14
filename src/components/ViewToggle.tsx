'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { calendarSFX } from '@/lib/sound-manager';

const VIEWS = [
  { label: 'Week', path: '/', desktopOnly: true },
  { label: 'Month', path: '/month', desktopOnly: true },
  { label: 'List', path: '/list', desktopOnly: false },
] as const;

export function ViewToggle() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <div className="flex items-center rounded-full border border-grove-border bg-grove-bg overflow-hidden">
      {VIEWS.map(({ label, path, desktopOnly }) => (
        <Link
          key={path}
          href={path}
          onClick={() => { if (!isActive(path)) calendarSFX.play('scroll'); }}
          className={[
            'px-3 py-1 text-xs font-medium transition-colors',
            desktopOnly ? 'hidden sm:block' : '',
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
