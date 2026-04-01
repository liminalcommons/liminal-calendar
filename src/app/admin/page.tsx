'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { apiFetch } from '@/lib/api-fetch';

interface Member {
  id: number;
  hyloId: string;
  name: string;
  email: string | null;
  image: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

const ROLES = ['member', 'host', 'admin'] as const;

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-800 border-red-200',
  host: 'bg-amber-100 text-amber-800 border-amber-200',
  member: 'bg-grove-border/30 text-grove-text-muted border-grove-border',
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const userRole = (session?.user as any)?.role;

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
            <table className="w-full">
              <thead>
                <tr className="border-b border-grove-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-grove-text-muted uppercase tracking-wider">Member</th>
                  <th className="px-4 py-3 text-xs font-medium text-grove-text-muted uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-xs font-medium text-grove-text-muted uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.hyloId} className="border-b border-grove-border/40 last:border-0">
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
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-grove-text-muted">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
