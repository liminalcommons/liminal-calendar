import NextAuth from 'next-auth';

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

// Admin allowlist — Hylo IDs that get 'admin' role regardless of Hylo group role
// Hylo only exposes hasModeratorRole, no distinct admin field
const ADMIN_HYLO_IDS = ['67402', '69224', '55015', '69655']; // victor, psygenlab, danielle johnson, erik h

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

      // Refresh if: expired (with 60s buffer) OR no expiry stored
      const expires = token.accessTokenExpires as number | undefined;
      const needsRefresh = !expires || Date.now() > expires - 60_000;
      const hasRefreshToken = !!token.refreshToken;

      // No refresh token and expired → clear token so page can force re-auth
      if (!hasRefreshToken && needsRefresh) {
        return { ...token, accessToken: undefined, error: 'token_expired' };
      }

      if (hasRefreshToken && needsRefresh) {
        try {
          const clientId = process.env.HYLO_CLIENT_ID?.trim();
          const clientSecret = process.env.HYLO_CLIENT_SECRET?.trim();
          const res = await fetch('https://www.hylo.com/noo/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: token.refreshToken as string,
              client_id: clientId ?? '',
              client_secret: clientSecret ?? '',
            }),
          });
          if (res.ok) {
            const refreshed = await res.json() as {
              access_token: string;
              refresh_token?: string;
              expires_in?: number;
            };
            token.accessToken = refreshed.access_token;
            if (refreshed.refresh_token) token.refreshToken = refreshed.refresh_token;
            token.accessTokenExpires = Date.now() + (refreshed.expires_in ?? 3600) * 1000;
            console.log('[auth] token refreshed OK, expires_in:', refreshed.expires_in);
          } else {
            const errText = await res.text().catch(() => '');
            console.error('[auth] Hylo token refresh failed:', res.status, errText);
          }
        } catch (err) {
          console.error('[auth] Hylo token refresh error:', err);
        }
      }

      return token;
    },
    async session({ session, token }) {
      const user = session.user as unknown as Record<string, unknown>;
      if (token.hyloId) user.hyloId = token.hyloId;
      if (token.picture) user.image = token.picture;
      // Role: check admin allowlist first, then token.role, then default to 'member'
      // Gateway JWT may not include role — determine it here from hyloId
      const hyloId = token.hyloId as string | undefined;
      if (hyloId && ADMIN_HYLO_IDS.includes(hyloId)) {
        user.role = 'admin';
      } else {
        user.role = token.role || 'member';
      }
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
