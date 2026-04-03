'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

export interface PickedMember {
  hyloId: string;
  name: string;
  image: string | null;
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
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/admin/members`);
        if (res.ok) {
          const data = await res.json();
          const selectedIds = new Set(selected.map(s => s.hyloId));
          const filtered = (data as any[])
            .filter(m => m.name.toLowerCase().includes(q.toLowerCase()) && !selectedIds.has(m.hyloId))
            .slice(0, 8)
            .map(m => ({ hyloId: m.hyloId, name: m.name, image: m.image }));
          setResults(filtered);
        }
      } catch {} finally { setSearching(false); }
    }, 200);
  }, [selected]);

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
        <div className="mt-1 bg-grove-surface border border-grove-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
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
            </button>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map(s => (
            <span key={s.hyloId} className="inline-flex items-center gap-1 bg-grove-green/20 text-grove-green text-xs px-2 py-1 rounded-full">
              {s.name}
              <button onClick={() => remove(s.hyloId)} className="hover:text-red-400"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
