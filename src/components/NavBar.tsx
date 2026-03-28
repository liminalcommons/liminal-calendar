'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Volume2, VolumeX, LogOut, CalendarPlus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { ViewToggle } from './ViewToggle';
import { RuneAccent } from './RuneAccent';
import { calendarSFX } from '@/lib/sound-manager';

function getRoleLabel(role?: string): string | null {
  if (role === 'admin') return 'admin';
  if (role === 'host') return 'host';
  return null;
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

const WEBCAL_URL = 'webcal://calendar.castalia.one/api/calendar/feed.ics';
const FEED_URL = 'https://calendar.castalia.one/api/calendar/feed.ics';
const GOOGLE_URL = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL_URL)}`;
const OUTLOOK_URL = `https://outlook.live.com/calendar/addcalendar?url=${encodeURIComponent(FEED_URL)}`;

export function NavBar() {
  const { data: session, status } = useSession();
  const [muted, setMuted] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const subRef = useRef<HTMLDivElement>(null);

  // Sync initial mute state from calendarSFX on mount
  useEffect(() => {
    setMuted(calendarSFX.isMuted());
  }, []);

  // Close subscribe dropdown on outside click
  useEffect(() => {
    if (!subOpen) return;
    const handler = (e: MouseEvent) => {
      if (subRef.current && !subRef.current.contains(e.target as Node)) {
        setSubOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [subOpen]);

  const toggleMute = () => {
    const next = !muted;
    calendarSFX.setMuted(next);
    setMuted(next);
    if (!next) {
      // Play sound only when un-muting (so you hear that sound is back)
      calendarSFX.play('navigate');
    }
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  const handleSignIn = () => {
    const gateway = process.env.NEXT_PUBLIC_AUTH_GATEWAY_URL || 'https://auth.castalia.one';
    const callbackUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${gateway}/signin?callbackUrl=${callbackUrl}`;
  };

  const user = session?.user as { name?: string | null; email?: string | null; image?: string | null; role?: string } | undefined;
  const roleLabel = getRoleLabel(user?.role);
  const initials = getInitials(user?.name, user?.email);

  return (
    <nav className="flex items-center justify-between px-4 h-14 bg-grove-surface border-b border-grove-border">
      {/* Left: rune glyph + title */}
      <div className="flex items-center gap-2">
        <RuneAccent size="md" seed={2} />
        <span className="text-grove-text font-semibold text-sm tracking-wide">
          Liminal Commons
        </span>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-3">
        <ViewToggle />

        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* Subscribe dropdown */}
        <div className="relative" ref={subRef}>
          <button
            onClick={() => setSubOpen(!subOpen)}
            className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            aria-label="Subscribe to calendar"
            title="Subscribe to calendar"
          >
            <CalendarPlus size={16} />
          </button>
          {subOpen && (
            <div className="absolute right-0 top-full mt-1 bg-grove-surface border border-grove-border rounded-lg shadow-lg py-1.5 min-w-[140px] z-50">
              <a href={GOOGLE_URL} target="_blank" rel="noopener noreferrer" className="block px-3 py-1.5 text-xs text-grove-text hover:bg-grove-border/30 transition-colors">Google Calendar</a>
              <a href={WEBCAL_URL} className="block px-3 py-1.5 text-xs text-grove-text hover:bg-grove-border/30 transition-colors">Apple Calendar</a>
              <a href={OUTLOOK_URL} target="_blank" rel="noopener noreferrer" className="block px-3 py-1.5 text-xs text-grove-text hover:bg-grove-border/30 transition-colors">Outlook</a>
            </div>
          )}
        </div>

        {status === 'authenticated' && user ? (
          <>
            {/* Avatar + role badge */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-7 h-7 rounded-full bg-grove-accent flex items-center justify-center text-grove-surface text-xs font-semibold select-none"
                title={user?.name ?? user?.email ?? undefined}
              >
                {initials}
              </div>
              {roleLabel && (
                <span className="text-[10px] font-medium text-grove-accent-deep bg-grove-border/50 px-1.5 py-0.5 rounded-full">
                  {roleLabel}
                </span>
              )}
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
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
