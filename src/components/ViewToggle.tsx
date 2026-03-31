'use client';

import { usePathname, useRouter } from 'next/navigation';
import { calendarSFX } from '@/lib/sound-manager';

const VIEWS = [
  { label: 'Week', path: '/' },
  { label: 'Month', path: '/month' },
  { label: 'List', path: '/list' },
] as const;

export function ViewToggle() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const handleSwitch = (path: string) => {
    if (!isActive(path)) {
      calendarSFX.play('scroll');
      router.push(path);
    }
  };

  return (
    <div className="flex items-center rounded-full border border-grove-border bg-grove-bg overflow-hidden">
      {VIEWS.map(({ label, path }) => (
        <button
          key={path}
          onClick={() => handleSwitch(path)}
          className={[
            'px-3 py-1 text-xs font-medium transition-colors',
            isActive(path)
              ? 'bg-grove-accent-deep text-grove-surface'
              : 'text-grove-text-muted hover:text-grove-text',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
