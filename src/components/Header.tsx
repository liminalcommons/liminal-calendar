'use client';

import Link from 'next/link';
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';
import { ThresholdRune, SunRune } from './runes';

export function Header() {
  const { isSignedIn, isLoaded } = useUser();

  return (
    <header
      className="border-b"
      style={{
        background: 'linear-gradient(180deg, var(--parchment), var(--stone-50))',
        borderColor: 'var(--stone-200)',
      }}
    >
      {/* Portal frame top decoration */}
      <div
        className="h-1"
        style={{
          background: 'linear-gradient(90deg, transparent 10%, var(--gold-400) 50%, transparent 90%)',
        }}
      />

      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="text-2xl transition-transform group-hover:scale-110">
            <ThresholdRune size="xl" variant="gold" />
          </span>
          <div>
            <span
              className="font-rune text-xl block"
              style={{ color: 'var(--stone-800)' }}
            >
              Liminal Calendar
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--stone-500)' }}
            >
              The Threshold Awaits
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/events"
            className="threshold-glow px-3 py-1 rounded transition-colors"
            style={{ color: 'var(--stone-600)' }}
          >
            All Events
          </Link>

          {isLoaded && (
            <>
              {isSignedIn ? (
                <div className="flex items-center gap-3">
                  <Link
                    href="/events/new"
                    className="btn-rune flex items-center gap-2"
                  >
                    <SunRune size="sm" />
                    Create Event
                  </Link>
                  <UserButton afterSignOutUrl="/" />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <SignInButton mode="modal">
                    <button
                      className="threshold-glow px-3 py-1 rounded transition-colors"
                      style={{ color: 'var(--stone-600)' }}
                    >
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="btn-rune">
                      Sign Up
                    </button>
                  </SignUpButton>
                </div>
              )}
            </>
          )}
        </nav>
      </div>

      {/* Portal frame bottom decoration */}
      <div
        className="h-0.5"
        style={{
          background: 'linear-gradient(90deg, transparent 20%, var(--stone-300) 50%, transparent 80%)',
        }}
      />
    </header>
  );
}
