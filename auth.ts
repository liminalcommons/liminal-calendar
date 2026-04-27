import NextAuth from 'next-auth';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveRole, resolveSessionRole } from '@/lib/auth/role';
import { syncMember } from '@/lib/auth/member-sync';

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

// Browser-facing OAuth host for Hylo — defaults to the hylo-oauth-proxy CF
// Worker so iOS/Android don't hijack via Universal Links claimed on
// www.hylo.com. Token + userinfo stay on www.hylo.com (server-to-server).
// Override with HYLO_OAUTH_BROWSER_HOST.
const HYLO_BROWSER_HOST = process.env.HYLO_OAUTH_BROWSER_HOST?.trim() || 'hylo-login.castalia.one';

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
        url: `https://${HYLO_BROWSER_HOST}/noo/oauth/auth`,
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
        token.role = resolveRole({
          hyloId: p.id,
          isLiminalCommonsMember: Boolean(lcMembership),
          hasModeratorRole: Boolean(lcMembership?.hasModeratorRole),
          adminAllowlist: ADMIN_HYLO_IDS,
        });
      }

      // Upsert member record on first sign-in only (jwt callback with account).
      // Fire-and-forget: the sign-in flow must not block on DB availability.
      if (account && token.hyloId) {
        syncMember(db, {
          hyloId: token.hyloId as string,
          name: token.name as string | null | undefined,
          email: token.email as string | null | undefined,
          image: token.picture as string | null | undefined,
          role: token.role as string | null | undefined,
        }).catch(() => {});
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
      let dbRole: string | undefined;
      if (hyloId) {
        try {
          const [dbMember] = await db
            .select({ role: members.role })
            .from(members)
            .where(eq(members.hyloId, hyloId))
            .limit(1);
          dbRole = dbMember?.role;
        } catch {
          // DB not ready or members table doesn't exist yet — fall through
        }
      }
      user.role = resolveSessionRole({
        hyloId,
        dbRole,
        tokenRole: token.role as string | undefined,
        adminAllowlist: ADMIN_HYLO_IDS,
      });

      // Expose access token for server-side helpers
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
  // Cookie scoping: defer to NextAuth defaults so the session cookie is set
  // on whichever host serves the request (liminalcalendar.com or
  // calendar.castalia.one). Previously we explicitly scoped to `.castalia.one`
  // for the gateway-shared-cookie pattern; that's incompatible with serving
  // on liminalcalendar.com (different eTLD+1).
  pages: {
    signIn: '/',
  },
  // Sign-in is handled in-app via NextAuth's standard signIn('hylo') flow:
  // the user is redirected to the Hylo authorize URL (proxied through
  // hylo-login.castalia.one to dodge the iOS Universal-Link hijack), Hylo
  // redirects back to /api/auth/callback/hylo on whichever host initiated,
  // NextAuth processes the callback and sets a host-only session cookie.
});
