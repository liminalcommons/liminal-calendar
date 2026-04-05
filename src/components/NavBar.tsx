'use client';

import { useSession, signOut } from 'next-auth/react';
import { Sun, Moon, Plus } from 'lucide-react';
import Link from 'next/link';
import { ViewToggle } from './ViewToggle';
import { RuneAccent } from './RuneAccent';
import { useTheme } from '@/components/providers/ThemeProvider';
import { NavGearMenu } from './NavGearMenu';

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

export function NavBar() {
  const { data: session, status } = useSession();
  const { theme, toggle: toggleTheme } = useTheme();

  const handleSignOut = () => signOut({ callbackUrl: '/' });

  const handleSignIn = () => {
    const gateway = process.env.NEXT_PUBLIC_AUTH_GATEWAY_URL || 'https://auth.castalia.one';
    const callbackUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${gateway}/signin?callbackUrl=${callbackUrl}`;
  };

  const user = session?.user as { name?: string | null; email?: string | null; image?: string | null; role?: string } | undefined;
  const initials = getInitials(user?.name, user?.email);

  return (
    <nav className="flex items-center justify-between px-4 h-14 bg-grove-surface border-b border-grove-border">
      {/* Left: rune glyph + title */}
      <div className="flex items-center gap-2">
        <RuneAccent size="md" seed={2} />
        <span className="hidden sm:inline text-grove-text font-semibold text-sm tracking-wide">
          Liminal Commons
        </span>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-3">
        <ViewToggle />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span className="text-[8px] leading-none">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>

        {status === 'authenticated' && user ? (
          <>
            {/* Create event — hosts + admins */}
            {(user.role === 'admin' || user.role === 'host') && (
              <Link
                href="/events/new"
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md text-grove-accent hover:text-grove-accent-deep hover:bg-grove-accent/10 transition-colors"
                title="Create new event"
              >
                <Plus size={14} />
                <span className="text-[8px] leading-none">New</span>
              </Link>
            )}

            {/* Avatar — links to profile */}
            <Link href="/profile" className="flex items-center" title="Your profile">
              <div className="w-7 h-7 rounded-full bg-grove-accent flex items-center justify-center text-grove-surface text-xs font-semibold select-none">
                {initials}
              </div>
            </Link>

            {/* Gear menu: Sound, Subscribe, Admin, Sign out */}
            <NavGearMenu
              isAdmin={user.role === 'admin'}
              onSignOut={handleSignOut}
            />
          </>
        ) : status === 'unauthenticated' ? (
          <button
            onClick={handleSignIn}
            className="text-xs px-3 py-1.5 rounded-md bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
          >
            Sign in
          </button>
        ) : null}
      </div>
    </nav>
  );
}
