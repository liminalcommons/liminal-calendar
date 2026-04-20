import NextAuth from 'next-auth';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

interface HyloProfile {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

interface HyloMembership {
  hasModeratorRole?: boolean;
  group: {
    id: string;
    name: string;
    slug: string;
  };
}

const isProduction = process.env.NODE_ENV === 'production';

// Liminal Commons Hylo group ID
const LIMINAL_COMMONS_GROUP_ID = '41955';

// Admin allowlist — Hylo IDs that get 'admin' role regardless of Hylo group role.
// Hylo only exposes hasModeratorRole, no distinct admin field.
// Source of truth: ADMIN_HYLO_IDS env var (comma-separated). Falls back to the
// historical inline list so an unset env var in dev doesn't lock out existing
// admins; production should always set the env var explicitly.
const DEFAULT_ADMIN_HYLO_IDS = ['67402', '69224', '55015', '69655']; // victor, psygenlab, danielle johnson, erik h
const ADMIN_HYLO_IDS_FROM_ENV = (process.env.ADMIN_HYLO_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_HYLO_IDS = ADMIN_HYLO_IDS_FROM_ENV.length > 0 ? ADMIN_HYLO_IDS_FROM_ENV : DEFAULT_ADMIN_HYLO_IDS;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: 'hylo',
      name: 'Hylo',
      type: 'oauth',
      authorization: {
        url: 'https://www.hylo.com/noo/oauth/auth',
        params: {
          scope: 'openid email profile offline_access',
          response_type: 'code',
          // web_only=true prevents Hylo from triggering its broken JS wallet code
          web_only: 'true',
        },
      },
      token: 'https://www.hylo.com/noo/oauth/token',
      userinfo: {
        // url is required by @auth/core assertConfig validation even when request() is provided
        url: 'https://www.hylo.com/noo/graphql',
        async request(context: { tokens: { access_token?: string } }) {
          const res = await fetch('https://www.hylo.com/noo/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${context.tokens.access_token}`,
            },
            body: JSON.stringify({
              query: '{ me { id name email avatarUrl memberships { items { hasModeratorRole group { id name slug } } } } }',
            }),
          });
          const { data } = await res.json() as {
            data: {
              me: HyloProfile & {
                memberships?: { items?: HyloMembership[] };
              };
            };
          };
          return data.me;
        },
      },
      profile(profile: HyloProfile) {
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email ?? null,
          image: profile.avatarUrl ?? null,
        };
      },
      checks: ['pkce', 'state'],
      clientId: process.env.HYLO_CLIENT_ID?.trim(),
      clientSecret: process.env.HYLO_CLIENT_SECRET?.trim(),
    },
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      // First sign-in: persist tokens from the OAuth exchange
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        // expires_at is seconds since epoch (set by NextAuth from expires_in)
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + (account.expires_in as number ?? 3600) * 1000;
      }
      if (profile) {
        const p = profile as HyloProfile & {
          memberships?: { items?: HyloMembership[] };
        };
        token.hyloId = p.id;
        token.picture = p.avatarUrl ?? token.picture;

        // Determine role based on Liminal Commons group membership (3-tier)
        const memberships = p.memberships?.items ?? [];
        const lcMembership = memberships.find(
          (m) => m.group.id === LIMINAL_COMMONS_GROUP_ID
        );
        if (!lcMembership) {
          // Not a member of Liminal Commons — blocked by middleware
          token.role = undefined;
        } else if (ADMIN_HYLO_IDS.includes(p.id)) {
          // Hardcoded admin allowlist (Hylo has no distinct admin role)
          token.role = 'admin';
        } else if (lcMembership.hasModeratorRole) {
          // Moderators in Hylo map to 'host' tier
          token.role = 'host';
        } else {
          token.role = 'member';
        }
      }

      // Upsert member record on first sign-in only (jwt callback with account)
      if (account && token.hyloId) {
        const hyloId = token.hyloId as string;
        const role = (token.role as string) || 'member';
        const feedToken = `feed_${randomBytes(12).toString('hex')}`;
        db.insert(members)
          .values({
            hyloId,
            name: (token.name as string) || 'Unknown',
            email: (token.email as string) || null,
            image: (token.picture as string) || null,
            role,
            feedToken,
          })
          .onConflictDoUpdate({
            target: members.hyloId,
            set: {
              name: (token.name as string) || 'Unknown',
              email: (token.email as string) || null,
              image: (token.picture as string) || null,
              updatedAt: new Date(),
            },
          })
          .then(() => {
            // Backfill: if existing member has no feed token, generate one
            return db.update(members)
              .set({ feedToken: `feed_${randomBytes(12).toString('hex')}` })
              .where(and(eq(members.hyloId, hyloId), isNull(members.feedToken)));
          })
          .catch(() => {}); // non-blocking, best-effort
      }

      // Token refresh is handled by auth.castalia.one (the auth gateway).
      // This app reads the shared .castalia.one cookie — do NOT refresh or
      // invalidate tokens here. The gateway manages the token lifecycle.

      return token;
    },
    async session({ session, token }) {
      const user = session.user as unknown as Record<string, unknown>;
      if (token.hyloId) user.hyloId = token.hyloId;
      if (token.picture) user.image = token.picture;

      const hyloId = token.hyloId as string | undefined;

      // Role priority: 1) DB members table override, 2) admin allowlist, 3) Hylo role, 4) 'member'
      let role: string = token.role as string || 'member';
      if (hyloId) {
        try {
          const [dbMember] = await db.select({ role: members.role }).from(members).where(eq(members.hyloId, hyloId)).limit(1);
          if (dbMember) {
            role = dbMember.role;
          } else if (ADMIN_HYLO_IDS.includes(hyloId)) {
            role = 'admin';
          }
        } catch {
          // DB not ready or members table doesn't exist yet — fall back to allowlist
          if (ADMIN_HYLO_IDS.includes(hyloId)) {
            role = 'admin';
          }
        }
      }
      user.role = role;

      // Expose access token for server-side helpers
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
  cookies: isProduction
    ? {
        sessionToken: {
          name: '__Secure-authjs.session-token',
          options: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: true,
            domain: '.castalia.one',
          },
        },
        callbackUrl: {
          name: '__Secure-authjs.callback-url',
          options: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: true,
            domain: '.castalia.one',
          },
        },
      }
    : undefined,
  pages: {
    signIn: '/',
  },
  // Sign-in is handled by redirecting to auth.castalia.one directly (gateway pattern).
  // auth.castalia.one runs the full Hylo OAuth flow and sets the session cookie on .castalia.one.
  // Calendar reads the shared cookie — no local OAuth or redirectProxyUrl needed.
});
