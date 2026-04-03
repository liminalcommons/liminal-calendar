'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { AvailabilityTimeline } from '@/components/availability/AvailabilityTimeline';

export interface PickedMember {
  hyloId: string;
  name: string;
  image: string | null;
  availability?: number[];
  timezone?: string;
}

interface InviteePickerProps {
  selected: PickedMember[];
  onChange: (members: PickedMember[]) => void;
  disabled?: boolean;
}

export function InviteePicker({ selected, onChange, disabled }: InviteePickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);
  const fetched = useRef(false);

  // Fetch all members once (includes availability + timezone)
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    apiFetch('/api/admin/members')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setAllMembers(data); })
      .catch(() => {});
  }, []);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(() => {
      const selectedIds = new Set(selected.map(s => s.hyloId));
      const filtered = allMembers
        .filter(m => m.name.toLowerCase().includes(q.toLowerCase()) && !selectedIds.has(m.hyloId))
        .slice(0, 8)
        .map(m => ({
          hyloId: m.hyloId,
          name: m.name,
          image: m.image,
          availability: JSON.parse(m.availability ?? '[]'),
          timezone: m.timezone ?? 'UTC',
        }));
      setResults(filtered);
      setSearching(false);
    }, 150);
  }, [selected, allMembers]);

  const add = (member: PickedMember) => {
    onChange([...selected, member]);
    setResults(prev => prev.filter(r => r.hyloId !== member.hyloId));
    setQuery('');
  };

  const remove = (hyloId: string) => {
    onChange(selected.filter(s => s.hyloId !== hyloId));
  };

  return (
    <div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grove-text-muted" />
        <input
          type="text"
          placeholder="Search members to invite..."
          value={query}
          onChange={e => handleSearch(e.target.value)}
          disabled={disabled}
          className="w-full pl-9 pr-4 py-2 text-sm bg-grove-surface border border-grove-border rounded-lg
                     text-grove-text placeholder:text-grove-text-dim
                     focus:outline-none focus:ring-1 focus:ring-grove-accent disabled:opacity-50"
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-grove-text-muted">...</span>}
      </div>

      {results.length > 0 && (
        <div className="mt-1 bg-grove-surface border border-grove-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.hyloId}
              onClick={() => add(r)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-grove-border/20 transition-colors"
            >
              {r.image ? (
                <img src={r.image} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-grove-accent/20 flex items-center justify-center text-[9px] font-semibold text-grove-accent-deep">
                  {r.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-grove-text">{r.name}</span>
              {r.availability && r.availability.length > 0 && (
                <span className="text-[9px] text-grove-green ml-auto">has availability</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Selected invitees with availability timelines */}
      {selected.length > 0 && (
        <div className="mt-3 space-y-2">
          {selected.map(s => (
            <div key={s.hyloId} className="bg-grove-bg border border-grove-border/50 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {s.image ? (
                    <img src={s.image} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-grove-accent/20 flex items-center justify-center text-[8px] font-semibold text-grove-accent-deep">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium text-grove-text">{s.name}</span>
                </div>
                <button onClick={() => remove(s.hyloId)} className="p-0.5 text-grove-text-muted hover:text-red-400 transition-colors">
                  <X size={12} />
                </button>
              </div>
              <AvailabilityTimeline
                slots={s.availability ?? []}
                timezone={s.timezone ?? 'UTC'}
                compact
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
