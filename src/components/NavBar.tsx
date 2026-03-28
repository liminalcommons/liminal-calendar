'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Volume2, VolumeX, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';
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

export function NavBar() {
  const { data: session, status } = useSession();
  const [muted, setMuted] = useState(false);

  // Sync initial mute state from calendarSFX on mount
  useEffect(() => {
    setMuted(calendarSFX.isMuted());
  }, []);

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
    signIn('hylo');
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
