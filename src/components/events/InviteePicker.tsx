'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

export interface Invitee {
  userId: string;
  name: string;
  handle?: string;
  image?: string | null;
}

interface InviteePickerProps {
  value: Invitee[];
  onChange: (next: Invitee[]) => void;
  cap?: number;
  disabled?: boolean;
}

export function InviteePicker({ value, onChange, cap, disabled }: InviteePickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Invitee[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  const atCap = cap !== undefined && value.length >= cap;

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/members/search?q=${encodeURIComponent(q)}&limit=10`);
        if (!res.ok) { setResults([]); return; }
        const data = await res.json();
        const selectedIds = new Set(value.map((s) => s.userId));
        const filtered: Invitee[] = (data.members ?? [])
          .filter((m: Invitee) => !selectedIds.has(m.userId))
          .map((m: { userId: string; name: string; handle?: string; image?: string | null }) => ({
            userId: m.userId,
            name: m.name,
            handle: m.handle,
            image: m.image,
          }));
        setResults(filtered);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  }, [value]);

  const add = (invitee: Invitee) => {
    if (atCap) return;
    // dedupe by userId
    if (value.some((v) => v.userId === invitee.userId)) return;
    onChange([...value, invitee]);
    setResults((prev) => prev.filter((r) => r.userId !== invitee.userId));
    setQuery('');
  };

  const remove = (userId: string) => {
    onChange(value.filter((v) => v.userId !== userId));
  };

  return (
    <div>
      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grove-text-muted" aria-hidden />
        <input
          type="text"
          aria-label="Search members to invite"
          placeholder={value.length === 0 ? 'Type a name to invite registered users.' : 'Search members to invite…'}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          disabled={disabled}
          className="w-full pl-9 pr-4 py-2 text-sm bg-grove-surface border border-grove-border rounded-lg
                     text-grove-text placeholder:text-grove-text-dim
                     focus:outline-none focus:ring-1 focus:ring-grove-accent disabled:opacity-50"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-grove-text-muted">
            …
          </span>
        )}
      </div>

      {/* Results dropdown */}
      {results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Member search results"
          className="mt-1 bg-grove-surface border border-grove-border rounded-lg overflow-hidden max-h-48 overflow-y-auto"
        >
          {atCap && (
            <li className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-grove-border">
              {cap}/{cap} reached — remove someone first
            </li>
          )}
          {results.map((r) => (
            <li key={r.userId} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => add(r)}
                disabled={atCap || disabled}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-grove-border/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {r.image ? (
                  <img src={r.image} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-grove-accent/20 flex items-center justify-center text-[9px] font-semibold text-grove-accent-deep flex-shrink-0">
                    {r.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="text-grove-text">{r.name}</span>
                {r.handle && (
                  <span className="text-grove-text-muted text-xs ml-1">@{r.handle}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Empty state */}
      {query.trim().length === 0 && value.length === 0 && (
        <p className="mt-1.5 text-xs text-grove-text-muted">
          Type a name to invite registered users.
        </p>
      )}

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((inv) => (
            <span
              key={inv.userId}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-grove-accent/10 border border-grove-accent/20 text-xs text-grove-accent-deep"
            >
              {inv.image ? (
                <img src={inv.image} alt="" className="w-4 h-4 rounded-full object-cover" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-grove-accent/30 flex items-center justify-center text-[8px] font-bold">
                  {inv.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              {inv.name}
              <button
                type="button"
                onClick={() => remove(inv.userId)}
                disabled={disabled}
                aria-label={`Remove ${inv.name}`}
                className="ml-0.5 text-grove-text-muted hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
