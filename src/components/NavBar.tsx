'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useUser, useClerk } from '@clerk/nextjs';
import { Sun, Moon, Plus } from 'lucide-react';
import Link from 'next/link';
import { ViewToggle } from './ViewToggle';
import { RuneAccent } from './RuneAccent';
import { useTheme } from '@/components/providers/ThemeProvider';
import { NavGearMenu } from './NavGearMenu';
import { NotificationButton } from './NotificationButton';
import { useIsGuest } from '@/lib/use-is-guest';
import { IntroStrip } from './IntroStrip';

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

export function NavBar({
  hideAbout = false,
  hideBrandText = false,
  hideIntro = false,
  viewBase = '',
  createHref,
}: {
  hideAbout?: boolean;
  hideBrandText?: boolean;
  hideIntro?: boolean;
  /** Conference view root (e.g. `/c/limicon1`) — keeps the view switcher inside it. */
  viewBase?: string;
  /** Show a + New event button beside the view switcher (conference only). */
  createHref?: string;
} = {}) {
  const { data: session, status } = useSession();
  const { isSignedIn: clerkSignedIn, user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const { theme, toggle: toggleTheme } = useTheme();

  const handleSignOut = async () => {
    if (clerkSignedIn) await clerkSignOut({ redirectUrl: '/' });
    else signOut({ callbackUrl: '/' });
  };

  const handleSignIn = () => {
    window.location.href = '/welcome';
  };

  const sessionUser = session?.user as { name?: string | null; email?: string | null; image?: string | null; role?: string } | undefined;
  const user = sessionUser ?? (clerkSignedIn ? {
    name: clerkUser?.fullName ?? clerkUser?.username ?? null,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    image: clerkUser?.imageUrl ?? null,
    role: 'member',
  } : undefined);
  const initials = getInitials(user?.name, user?.email);
  const isAuthed = status === 'authenticated' || clerkSignedIn;
  const isUnauthed = status === 'unauthenticated' && clerkLoaded && !clerkSignedIn;
  // Guest mode: cookie-flagged unauthenticated browsing (see lib/guest.ts).
  const isGuest = useIsGuest() && !isAuthed;

  // Live conferences (e.g. Limicon) — public directory, so this runs signed-out too.
  const [liveConferences, setLiveConferences] = useState<{ slug: string; name: string; status: string }[]>([]);
  useEffect(() => {
    fetch('/api/conferences')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) setLiveConferences(d.filter((c) => c.status === 'active'));
      })
      .catch(() => {});
  }, []);

  return (
    <>
    <nav className="flex items-center justify-between px-4 h-14 bg-grove-surface border-b border-grove-border">
      {/* Left: rune glyph + title + About */}
      <div className="flex items-center gap-2">
        <RuneAccent size="md" seed={2} />
        {!hideBrandText && (
          <span className="hidden sm:inline text-grove-text font-semibold text-sm tracking-wide">
            Liminal Commons
          </span>
        )}
        {!hideAbout && (
          <Link
            href="/about"
            className="ml-1 text-xs italic text-grove-text-muted hover:text-grove-text underline decoration-grove-accent/60 underline-offset-4"
          >
            About
          </Link>
        )}
        {liveConferences.map((c) => (
          <Link
            key={c.slug}
            href={`/c/${c.slug}`}
            className="ml-1 text-xs italic text-grove-accent-deep hover:text-grove-accent underline decoration-grove-accent/60 underline-offset-4"
          >
            {c.name}
          </Link>
        ))}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-3">
        {/* Guest chip — explains why participation is locked + gives the exit */}
        {isGuest && (
          <span
            data-testid="guest-chip"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-grove-border/60 bg-grove-border/15 px-3 py-1 text-[11px] text-grove-text-muted"
          >
            Browsing as guest
            <Link
              href="/welcome"
              className="font-semibold text-grove-accent-deep hover:text-grove-accent underline underline-offset-2"
            >
              Sign up
            </Link>
          </span>
        )}
        <ViewToggle base={viewBase} />
        {createHref && (
          <Link
            href={createHref}
            className="ml-1 px-3 py-1 rounded-full text-xs font-medium bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
          >
            + New event
          </Link>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span className="text-[8px] leading-none">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>

        {isAuthed && user ? (
          <>
            {/* Create event — hosts + admins (+ owners) */}
            {(user.role === 'admin' || user.role === 'host' || user.role === 'governor') && (
              <Link
                href="/events/new"
                className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md text-grove-accent hover:text-grove-accent-deep hover:bg-grove-accent/10 transition-colors"
                title="Create new event"
              >
                <Plus size={14} />
                <span className="text-[8px] leading-none">New</span>
              </Link>
            )}

            {/* Notifications inbox */}
            <NotificationButton />

            {/* Avatar — links to profile */}
            <Link href="/profile" className="flex items-center" title="Your profile">
              <div className="w-7 h-7 rounded-full bg-grove-accent flex items-center justify-center text-grove-surface text-xs font-semibold select-none">
                {initials}
              </div>
            </Link>

            {/* Gear menu: Sound, Subscribe, Admin, Sign out */}
            <NavGearMenu
              isAdmin={user.role === 'admin' || user.role === 'governor'}
              onSignOut={handleSignOut}
            />
          </>
        ) : isUnauthed ? (
          <button
            onClick={handleSignIn}
            className="text-xs px-3 py-1.5 rounded-md bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
          >
            Sign in
          </button>
        ) : null}
      </div>
    </nav>
    {/* One-time intro for non-members who skipped the landing page */}
    {!hideIntro && <IntroStrip show={isUnauthed} />}
    </>
  );
}
