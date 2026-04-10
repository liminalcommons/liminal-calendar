'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { apiFetch } from '@/lib/api-fetch';
import { AvailabilityTimeline } from '@/components/availability/AvailabilityTimeline';

interface Member {
  id: number;
  hyloId: string;
  name: string;
  email: string | null;
  image: string | null;
  role: string;
  timezone: string | null;
  availability: string | null;
  createdAt: string;
  updatedAt: string;
}

const ROLES = ['member', 'host', 'admin'] as const;

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-900/30 text-red-300 border-red-700/50 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/50',
  host: 'bg-amber-900/30 text-amber-300 border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50',
  member: 'bg-grove-border/30 text-grove-text-muted border-grove-border',
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const userRole = session?.user?.role;

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' || userRole !== 'admin') {
      router.replace('/');
      return;
    }

    apiFetch('/api/admin/members')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMembers(data.sort((a: Member, b: Member) => {
            const order = { admin: 0, host: 1, member: 2 };
            return (order[a.role as keyof typeof order] ?? 3) - (order[b.role as keyof typeof order] ?? 3);
          }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [status, userRole, router]);

  const handleRoleChange = async (hyloId: string, newRole: string) => {
    setUpdating(hyloId);
    try {
      const res = await apiFetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hyloId, role: newRole }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMembers(prev =>
          prev.map(m => m.hyloId === hyloId ? { ...m, role: updated.role } : m)
            .sort((a, b) => {
              const order = { admin: 0, host: 1, member: 2 };
              return (order[a.role as keyof typeof order] ?? 3) - (order[b.role as keyof typeof order] ?? 3);
            })
        );
      }
    } catch {
      // silent
    } finally {
      setUpdating(null);
    }
  };

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/admin/search-hylo?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out users already in members list
          const existingIds = new Set(members.map(m => m.hyloId));
          setSearchResults(data.filter((u: any) => !existingIds.has(u.id)));
        }
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [members]);

  const handleAddMember = async (user: { id: string; name: string; avatarUrl: string | null }, role: string) => {
    setAddingId(user.id);
    try {
      const res = await apiFetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hyloId: user.id, name: user.name, image: user.avatarUrl, role }),
      });
      if (res.ok) {
        const created = await res.json();
        setMembers(prev => [...prev, created].sort((a, b) => {
          const order = { admin: 0, host: 1, member: 2 };
          return (order[a.role as keyof typeof order] ?? 3) - (order[b.role as keyof typeof order] ?? 3);
        }));
        setSearchResults(prev => prev.filter(u => u.id !== user.id));
        setSearchQuery('');
      }
    } catch {
      // silent
    } finally {
      setAddingId(null);
    }
  };

  if (status === 'loading' || (status === 'authenticated' && userRole !== 'admin')) {
    return (
      <div className="min-h-screen bg-grove-bg">
        <NavBar />
        <div className="flex items-center justify-center py-20">
          <p className="text-grove-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-grove-text-muted hover:text-grove-text mb-4 transition-colors"
        >
          ← Back to Calendar
        </button>
        <div className="mb-6">
          <h1 className="text-2xl font-serif text-grove-text">Member Directory</h1>
          <p className="text-sm text-grove-text-muted mt-1">
            {members.length} {members.length === 1 ? 'member' : 'members'} · Assign roles to control event creation permissions
          </p>
        </div>

        {/* Role legend */}
        <div className="flex gap-4 mb-6 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400" /> admin — full control
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> host — create + edit own events
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-grove-border" /> member — view + RSVP only
          </span>
        </div>

        {/* Search Hylo users to add */}
        <div className="mb-6">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grove-text-muted" />
            <input
              type="text"
              placeholder="Search Hylo users to add..."
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-grove-surface border border-grove-border rounded-lg
                         text-grove-text placeholder:text-grove-text-dim
                         focus:outline-none focus:ring-1 focus:ring-grove-accent"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-grove-text-muted">searching...</span>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 bg-grove-surface border border-grove-border rounded-lg overflow-hidden">
              {searchResults.map(user => (
                <div key={user.id} className="flex items-center justify-between px-4 py-2.5 border-b border-grove-border/40 last:border-0">
                  <div className="flex items-center gap-3">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-grove-accent/20 flex items-center justify-center text-xs font-semibold text-grove-accent-deep">
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm text-grove-text">{user.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(['member', 'host', 'admin'] as const).map(role => (
                      <button
                        key={role}
                        onClick={() => handleAddMember(user, role)}
                        disabled={addingId === user.id}
                        className={`text-[10px] px-2 py-1 rounded border transition-colors disabled:opacity-50
                          ${role === 'admin' ? 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20' :
                            role === 'host' ? 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20' :
                            'border-grove-border text-grove-text-muted hover:bg-grove-border/20'}`}
                      >
                        <UserPlus size={10} className="inline mr-0.5" />{role}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-grove-surface rounded-lg animate-pulse" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-grove-text-muted italic">No members yet. Members appear here after they sign in.</p>
          </div>
        ) : (
          <div className="bg-grove-surface border border-grove-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-grove-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-grove-text-muted uppercase tracking-wider">Member</th>
                  <th className="px-4 py-3 text-xs font-medium text-grove-text-muted uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-xs font-medium text-grove-text-muted uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => {
                  const isExpanded = expandedMember === member.hyloId;
                  const availSlots: number[] = (() => { try { return JSON.parse(member.availability ?? '[]'); } catch { return []; } })();
                  return (
                    <React.Fragment key={member.hyloId}>
                      <tr className="border-b border-grove-border/40 last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {member.image ? (
                              <img src={member.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-grove-accent/20 flex items-center justify-center text-xs font-semibold text-grove-accent-deep">
                                {member.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-grove-text">{member.name}</p>
                              {member.email && (
                                <p className="text-[11px] text-grove-text-muted">{member.email}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={member.role}
                            onChange={e => handleRoleChange(member.hyloId, e.target.value)}
                            disabled={updating === member.hyloId}
                            className={`text-xs font-medium px-2 py-1 rounded-md border cursor-pointer
                              ${ROLE_COLORS[member.role] || ROLE_COLORS.member}
                              disabled:opacity-50 disabled:cursor-wait
                              focus:outline-none focus:ring-1 focus:ring-grove-accent`}
                          >
                            {ROLES.map(r => (
                              <option key={r} value={r} className="bg-grove-surface text-grove-text">{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-grove-text-muted">
                              {new Date(member.createdAt).toLocaleDateString()}
                            </span>
                            <button
                              onClick={() => setExpandedMember(isExpanded ? null : member.hyloId)}
                              className="p-1 rounded text-grove-text-muted hover:text-grove-text hover:bg-grove-border/20 transition-colors"
                              title="View availability"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-grove-border/40">
                          <td colSpan={3} className="px-4 py-3 bg-grove-bg/50">
                            <AvailabilityTimeline
                              slots={availSlots}
                              timezone={member.timezone ?? 'UTC'}
                              name={member.name}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
