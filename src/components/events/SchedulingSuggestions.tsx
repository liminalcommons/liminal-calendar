'use client';

import { useEffect, useState } from 'react';
import { Clock, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import type { SchedulingSuggestion } from '@/lib/scheduling';

interface SchedulingSuggestionsProps {
  inviteeIds: string[];
  durationMinutes: number;
  onSelect: (suggestion: SchedulingSuggestion) => void;
}

export function SchedulingSuggestions({ inviteeIds, durationMinutes, onSelect }: SchedulingSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SchedulingSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (inviteeIds.length === 0) { setSuggestions([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/scheduling/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteeIds, durationMinutes }),
        });
        if (res.ok) {
          setSuggestions(await res.json());
        }
      } catch { /* silent */ } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [inviteeIds, durationMinutes]);

  if (inviteeIds.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Clock size={12} className="text-grove-accent" />
        <span className="text-[11px] font-semibold text-grove-accent uppercase tracking-wider">Best Times</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-14 bg-grove-border/20 rounded-lg animate-pulse" />)}
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-xs text-grove-text-muted italic py-4 text-center">
          {inviteeIds.length > 0 ? 'No common availability found. Invitees may not have set their availability yet.' : 'Add invitees to see suggestions.'}
        </p>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelect(s)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                s.available === s.total
                  ? 'bg-grove-green/10 border-grove-green/30 hover:bg-grove-green/20'
                  : 'bg-grove-surface border-grove-border hover:bg-grove-border/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-grove-text">
                  {s.day} {s.startTime} – {s.endTime} UTC
                </span>
                <span className="flex items-center gap-1 text-xs text-grove-text-muted">
                  <Users size={10} />
                  {s.available}/{s.total}
                </span>
              </div>
              {s.missing.length > 0 && (
                <p className="text-[10px] text-grove-text-muted mt-1">
                  Missing: {s.missing.map(m => m.name).join(', ')}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
