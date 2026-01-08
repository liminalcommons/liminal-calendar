'use client';

import { useState } from 'react';
import { type User } from '@/lib/supabase';

interface UserMarkerProps {
  users: User[];
  maxVisible?: number;
}

// Format timezone for display (e.g., "America/New_York" -> "New York")
function formatTimezone(tz: string): string {
  return tz.split('/').pop()?.replace(/_/g, ' ') || tz;
}

// Get time in timezone
function getLocalTime(timezone: string): string {
  try {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--';
  }
}

/**
 * Displays a group of user avatars, with hover popover showing details
 */
export function UserMarker({ users, maxVisible = 3 }: UserMarkerProps) {
  const [showPopover, setShowPopover] = useState(false);

  if (users.length === 0) return null;

  const visibleUsers = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      {/* Avatar stack */}
      <div className="flex -space-x-2 items-center cursor-pointer">
        {visibleUsers.map((user, index) => (
          <div
            key={user.clerk_id}
            className="relative"
            style={{ zIndex: maxVisible - index }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-6 h-6 rounded-full border-2 border-white shadow-sm object-cover hover:scale-110 transition-transform"
              />
            ) : (
              <div className="w-6 h-6 rounded-full border-2 border-white shadow-sm bg-gold-400 flex items-center justify-center text-[10px] font-bold text-gold-900 hover:scale-110 transition-transform">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="w-6 h-6 rounded-full border-2 border-white shadow-sm bg-stone-300 flex items-center justify-center text-[10px] font-bold text-stone-700">
            +{overflow}
          </div>
        )}
      </div>

      {/* Hover popover */}
      {showPopover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-white rounded-lg shadow-lg border border-stone-200 p-2 min-w-[160px]">
            <div className="text-[10px] text-stone-500 mb-1 font-medium">
              {users.length} {users.length === 1 ? 'person' : 'people'} here
            </div>
            <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
              {users.map((user) => (
                <div key={user.clerk_id} className="flex items-center gap-2">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gold-400 flex items-center justify-center text-[8px] font-bold text-gold-900">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-stone-800 truncate">
                      {user.name}
                    </div>
                    {user.timezone && (
                      <div className="text-[10px] text-stone-500">
                        {formatTimezone(user.timezone)} · {getLocalTime(user.timezone)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-white border-r border-b border-stone-200 transform rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Single user avatar (smaller variant)
 */
export function UserDot({ user }: { user: User }) {
  return (
    <div
      className="cursor-pointer"
      title={user.name}
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.name}
          className="w-5 h-5 rounded-full border border-white/50 shadow-sm object-cover"
        />
      ) : (
        <div className="w-5 h-5 rounded-full border border-white/50 shadow-sm bg-gold-400 flex items-center justify-center text-[8px] font-bold text-gold-900">
          {user.name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}
