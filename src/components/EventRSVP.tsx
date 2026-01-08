'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { getEventRSVPs, upsertRSVP, deleteRSVP, EventRSVP, RSVPStatus } from '@/lib/supabase';

interface EventRSVPProps {
  eventId: string;
  eventSource: 'community' | 'google';
}

export function EventRSVPSection({ eventId, eventSource }: EventRSVPProps) {
  const { user, isLoaded, isSignedIn } = useUser();
  const [rsvps, setRsvps] = useState<EventRSVP[]>([]);
  const [userRsvp, setUserRsvp] = useState<EventRSVP | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function loadRSVPs() {
      try {
        const data = await getEventRSVPs(eventId);
        setRsvps(data);
      } catch (e) {
        console.error('Failed to fetch RSVPs:', e);
      } finally {
        setLoading(false);
      }
    }
    loadRSVPs();
  }, [eventId]);

  useEffect(() => {
    if (isLoaded && user && rsvps.length > 0) {
      const existing = rsvps.find(r => r.user_id === user.id);
      setUserRsvp(existing || null);
    }
  }, [isLoaded, user, rsvps]);

  async function handleRSVP(status: RSVPStatus) {
    if (!user) return;
    setUpdating(true);
    try {
      const newRsvp = await upsertRSVP({
        event_id: eventId,
        event_source: eventSource,
        user_id: user.id,
        user_name: user.fullName || user.username || 'Anonymous',
        user_image_url: user.imageUrl,
        status,
      });

      // Update local state
      setRsvps(prev => {
        const existing = prev.findIndex(r => r.user_id === user.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newRsvp;
          return updated;
        }
        return [...prev, newRsvp];
      });
      setUserRsvp(newRsvp);
    } catch (e) {
      console.error('Failed to RSVP:', e);
    } finally {
      setUpdating(false);
    }
  }

  async function handleRemoveRSVP() {
    if (!user) return;
    setUpdating(true);
    try {
      await deleteRSVP(eventId, user.id);
      setRsvps(prev => prev.filter(r => r.user_id !== user.id));
      setUserRsvp(null);
    } catch (e) {
      console.error('Failed to remove RSVP:', e);
    } finally {
      setUpdating(false);
    }
  }

  const goingCount = rsvps.filter(r => r.status === 'going').length;
  const maybeCount = rsvps.filter(r => r.status === 'maybe').length;
  const goingRsvps = rsvps.filter(r => r.status === 'going');
  const maybeRsvps = rsvps.filter(r => r.status === 'maybe');

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
        Who&apos;s Coming?
      </h2>

      {/* RSVP Counts */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          <span className="text-gray-700 dark:text-gray-300">{goingCount} going</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
          <span className="text-gray-700 dark:text-gray-300">{maybeCount} maybe</span>
        </span>
      </div>

      {/* Attendees List */}
      {(goingRsvps.length > 0 || maybeRsvps.length > 0) && (
        <div className="mb-4 space-y-3">
          {goingRsvps.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Going:</p>
              <div className="flex flex-wrap gap-2">
                {goingRsvps.map(rsvp => (
                  <div
                    key={rsvp.id}
                    className="flex items-center gap-2 px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded-full"
                  >
                    {rsvp.user_image_url ? (
                      <img
                        src={rsvp.user_image_url}
                        alt={rsvp.user_name}
                        className="w-5 h-5 rounded-full"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">
                        {rsvp.user_name[0]}
                      </div>
                    )}
                    <span className="text-sm text-green-800 dark:text-green-200">
                      {rsvp.user_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {maybeRsvps.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Maybe:</p>
              <div className="flex flex-wrap gap-2">
                {maybeRsvps.map(rsvp => (
                  <div
                    key={rsvp.id}
                    className="flex items-center gap-2 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-full"
                  >
                    {rsvp.user_image_url ? (
                      <img
                        src={rsvp.user_image_url}
                        alt={rsvp.user_name}
                        className="w-5 h-5 rounded-full"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs">
                        {rsvp.user_name[0]}
                      </div>
                    )}
                    <span className="text-sm text-yellow-800 dark:text-yellow-200">
                      {rsvp.user_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* RSVP Buttons */}
      {loading ? (
        <div className="h-10 bg-gray-200 dark:bg-gray-600 rounded-lg animate-pulse"></div>
      ) : !isSignedIn ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Sign in to RSVP for this event
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleRSVP('going')}
            disabled={updating}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              userRsvp?.status === 'going'
                ? 'bg-green-500 text-white'
                : 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-green-100 dark:hover:bg-green-900/30 border border-gray-200 dark:border-gray-500'
            } disabled:opacity-50`}
          >
            {userRsvp?.status === 'going' ? "I'm Going!" : "I'm Going"}
          </button>
          <button
            onClick={() => handleRSVP('maybe')}
            disabled={updating}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              userRsvp?.status === 'maybe'
                ? 'bg-yellow-500 text-white'
                : 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 border border-gray-200 dark:border-gray-500'
            } disabled:opacity-50`}
          >
            Maybe
          </button>
          {userRsvp && (
            <button
              onClick={handleRemoveRSVP}
              disabled={updating}
              className="px-4 py-2 rounded-lg font-medium text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
