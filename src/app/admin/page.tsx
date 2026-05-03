'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { apiFetch } from '@/lib/api-fetch';
import { AvailabilityTimeline } from '@/components/availability/AvailabilityTimeline';
import { ReportsPanel } from '@/components/admin/ReportsPanel';

interface Member {
  id: number;
  // Clerk-only members carry null hyloId; Hylo-only members carry null clerkId.
  // The DB CHECK constraint guarantees at least one is non-null per row.
  hyloId: string | null;
  clerkId: string | null;
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

function ProviderBadge({ member }: { member: Member }) {
  const hasHylo = Boolean(member.hyloId);
  const hasClerk = Boolean(member.clerkId);
  if (hasHylo && hasClerk) {
    return (
      <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wide rounded bg-grove-accent/20 text-grove-accent-deep border border-grove-accent/30">
        Hylo + Clerk
      </span>
    );
  }
  if (hasHylo) {
    return (
      <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wide rounded bg-grove-border/30 text-grove-text-muted border border-grove-border/50">
        Hylo
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wide rounded bg-blue-900/20 text-blue-300 border border-blue-700/40">
      Clerk
    </span>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'reports' ? 'reports' : 'members';
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  // Track in-flight role updates and expansion by `member.id` (numeric pk).
  // Was previously keyed by `hyloId` — Clerk-only members have null hyloId
  // and would collide on `null` (only one would be expandable at a time).
  const [updating, setUpdating] = useState<number | null>(null);
  const [expandedMember, setExpandedMember] = useState<number | null>(null);

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

  const handleRoleChange = async (member: Member, newRole: string) => {
    setUpdating(member.id);
    try {
      // Identify the row via whichever provider id the member carries.
      // Schema invariant: at least one of (hyloId, clerkId) is non-null.
      const identity = member.hyloId
        ? { hyloId: member.hyloId }
        : { clerkId: member.clerkId };
      const res = await apiFetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...identity, role: newRole }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMembers(prev =>
          prev.map(m => m.id === member.id ? { ...m, role: updated.role } : m)
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
          <h1 className="text-2xl font-serif text-grove-text">Admin</h1>
          <p className="text-sm text-grove-text-muted mt-1">
            Manage members, roles, and review attendance reports.
          </p>
        </div>

        {/* Tabs */}
        <nav role="tablist" aria-label="Admin sections" className="flex gap-2 mb-6 border-b border-grove-border">
          <Link
            href="/admin?tab=members"
            role="tab"
            aria-selected={tab === 'members'}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'members'
                ? 'border-grove-accent text-grove-text'
                : 'border-transparent text-grove-text-muted hover:text-grove-text'
            }`}
          >
            Members
          </Link>
          <Link
            href="/admin?tab=reports"
            role="tab"
            aria-selected={tab === 'reports'}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'reports'
                ? 'border-grove-accent text-grove-text'
                : 'border-transparent text-grove-text-muted hover:text-grove-text'
            }`}
          >
            Reports
          </Link>
        </nav>

        {tab === 'reports' ? (
          <section role="tabpanel" aria-label="Attendance reports">
            <ReportsPanel />
          </section>
        ) : (
          <section role="tabpanel" aria-label="Member directory" className="mb-2">
            <div className="mb-4">
              <p className="text-sm text-grove-text-muted">
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
                  const isExpanded = expandedMember === member.id;
                  const availSlots: number[] = (() => { try { return JSON.parse(member.availability ?? '[]'); } catch { return []; } })();
                  return (
                    <React.Fragment key={member.id}>
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
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-grove-text">{member.name}</p>
                                <ProviderBadge member={member} />
                              </div>
                              {member.email && (
                                <p className="text-[11px] text-grove-text-muted">{member.email}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={member.role}
                            onChange={e => handleRoleChange(member, e.target.value)}
                            disabled={updating === member.id}
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
                              onClick={() => setExpandedMember(isExpanded ? null : member.id)}
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
          </section>
        )}
      </main>
    </div>
  );
}
