'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Users, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

export interface PickedUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface UserPickerProps {
  selected: PickedUser[];
  onChange: (members: PickedUser[]) => void;
  disabled?: boolean;
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-grove-accent/20 text-grove-accent text-[10px] font-bold shrink-0">
      {initials}
    </span>
  );
}

function Avatar({ user }: { user: PickedUser }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="w-6 h-6 rounded-full object-cover shrink-0"
      />
    );
  }
  return <Initials name={user.name} />;
}

export function UserPicker({ selected, onChange, disabled }: UserPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedUser[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchMembers = useCallback(async (search: string) => {
    if (!search.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`/api/members?search=${encodeURIComponent(search.trim())}`);
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data: PickedUser[] = await res.json();
      // Filter out already-selected members
      const selectedIds = new Set(selected.map(s => s.id));
      setResults(data.filter(m => !selectedIds.has(m.id)));
      setIsOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMembers(value), 300);
  };

  const handleSelect = (user: PickedUser) => {
    onChange([...selected, user]);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleRemove = (id: string) => {
    onChange(selected.filter(s => s.id !== id));
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="flex items-center gap-2">
        <Users size={14} className="text-grove-text-muted shrink-0" />
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={e => handleInputChange(e.target.value)}
            placeholder="Invite members..."
            className="w-full text-xs bg-grove-border/20 border border-grove-border rounded-md px-2.5 py-1.5
                       text-grove-text placeholder:text-grove-text-muted
                       focus:outline-none focus:ring-1 focus:ring-grove-accent
                       transition-colors"
            disabled={disabled}
          />
          {loading && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-grove-text-muted">
              ...
            </span>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 left-5 right-0 mt-1 bg-grove-surface border border-grove-border rounded-md shadow-lg max-h-40 overflow-y-auto">
          {results.map(user => (
            <button
              key={user.id}
              onClick={() => handleSelect(user)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-grove-text
                         hover:bg-grove-border/30 transition-colors text-left"
            >
              <Avatar user={user} />
              <span className="truncate">{user.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {isOpen && results.length === 0 && query.trim() && !loading && (
        <div className="absolute z-50 left-5 right-0 mt-1 bg-grove-surface border border-grove-border rounded-md shadow-lg px-3 py-2">
          <span className="text-xs text-grove-text-muted">No members found</span>
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 ml-5">
          {selected.map(user => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                         bg-grove-accent/10 border border-grove-accent/20 text-xs text-grove-text"
            >
              <Avatar user={user} />
              <span className="truncate max-w-[100px]">{user.name}</span>
              <button
                onClick={() => handleRemove(user.id)}
                className="p-0.5 rounded-full hover:bg-grove-accent/20 transition-colors"
                aria-label={`Remove ${user.name}`}
                disabled={disabled}
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
