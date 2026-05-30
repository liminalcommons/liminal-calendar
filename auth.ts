import NextAuth from 'next-auth';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { applyRedirectPolicy } from '@/lib/auth/redirect-policy';

const isProduction = process.env.NODE_ENV === 'production';

// Castalia identity provider — self-hosted Logto at id.castalia.one.
// Lets users who already have a Castalia identity (auto-enrolled when they
// sign into castalia.one) sign in to liminalcalendar.com without a separate
// account. Members can also sign in via Clerk (handled outside NextAuth).
const LOGTO_ISSUER = process.env.LOGTO_ISSUER?.trim() || 'https://id.castalia.one/oidc';

interface LogtoOidcProfile {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: 'logto',
      name: 'Castalia',
      type: 'oidc',
      issuer: LOGTO_ISSUER,
      // Declare the OAuth endpoints explicitly so Auth.js skips OIDC discovery.
      // Logto's discovery doc advertises
      // `authorization_response_iss_parameter_supported: true` but Logto never
      // emits `iss` on the callback redirect, so Auth.js (oauth4webapi) enforced
      // RFC-9207 and every Castalia callback failed with `?error=Configuration`.
      // When `token` and `userinfo` URLs are both provided, @auth/core's oauth
      // callback builds the authorization-server metadata from these endpoints
      // (handleOAuth: the non-discovery branch) WITHOUT that flag, so the `iss`
      // check is correctly skipped. Endpoint URLs are from Logto's discovery doc.
      authorization: { url: `${LOGTO_ISSUER}/auth`, params: { scope: 'openid email profile' } },
      token: `${LOGTO_ISSUER}/token`,
      userinfo: `${LOGTO_ISSUER}/me`,
      checks: ['pkce', 'state'],
      clientId: process.env.LOGTO_CLIENT_ID?.trim(),
      clientSecret: process.env.LOGTO_CLIENT_SECRET?.trim(),
      profile(profile: LogtoOidcProfile) {
        return {
          id: profile.sub,
          name: profile.name ?? null,
          email: profile.email ?? null,
          image: profile.picture ?? null,
        };
      },
    },
  ],
  session: { strategy: 'jwt' },
  logger: {
    error(error: Error & { cause?: unknown; type?: string; kind?: string }) {
      const safeStringify = (obj: unknown): string => {
        const seen = new WeakSet();
        return JSON.stringify(
          obj,
          (_key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) return '[Circular]';
              seen.add(value);
            }
            if (value instanceof Error) {
              return {
                name: value.name,
                message: value.message,
                stack: value.stack,
                cause: (value as Error & { cause?: unknown }).cause,
              };
            }
            return value;
          },
          2,
        );
      };
      console.error('[auth][error]', {
        name: error.name,
        message: error.message,
        type: error.type,
        kind: error.kind,
        stack: error.stack,
        full: safeStringify(error),
      });
    },
    warn(code: string) {
      console.warn('[auth][warn]', code);
    },
    debug(code: string, metadata?: unknown) {
      if (process.env.AUTH_DEBUG === 'true') console.log('[auth][debug]', code, metadata);
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      return applyRedirectPolicy({ url, baseUrl });
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + ((account.expires_in as number) ?? 3600) * 1000;
      }

      // Logto sign-in: email-based account linking — if an existing
      // `members` row matches the Logto userinfo email, carry its role
      // into the token so the user's persisted role (admin, host, etc.)
      // survives the Logto sign-in. Persist logtoId on the linked row.
      if (account?.provider === 'logto' && profile) {
        const p = profile as LogtoOidcProfile;
        token.logtoUserId = p.sub;
        token.picture = p.picture ?? token.picture;
        if (p.email) token.email = p.email;

        let linkedName: string | null = null;
        if (p.email) {
          try {
            const [existing] = await db
              .select()
              .from(members)
              .where(eq(members.email, p.email))
              .limit(1);
            if (existing) {
              if (existing.role) token.role = existing.role;
              linkedName = existing.name ?? null;
              if (!existing.logtoId) {
                await db
                  .update(members)
                  .set({ logtoId: p.sub, updatedAt: new Date() })
                  .where(eq(members.id, existing.id));
              }
            }
          } catch {
            // DB unavailable — fall through with logto-only identity.
          }
        }

        const emailLocal = p.email ? p.email.split('@')[0] : null;
        token.name = p.name || linkedName || emailLocal;
        if (!token.role) token.role = 'member';
      }

      return token;
    },
    async session({ session, token }) {
      const user = session.user as unknown as Record<string, unknown>;
      if (token.logtoUserId) user.logtoUserId = token.logtoUserId;
      if (token.picture) user.image = token.picture;
      user.role = (token.role as string | undefined) || 'member';
      (session as unknown as { accessToken?: unknown }).accessToken = token.accessToken;
      return session;
    },
  },
  // Cookie scoping: scope sessionToken + callbackUrl to `.liminalcalendar.com`
  // so a session set during an auth-subdomain OAuth callback is visible on
  // the liminalcalendar.com root where the app lives. csrfToken stays
  // host-only (`__Host-` prefix mandates it) — CSRF is single-flight within
  // the originating host only.
  cookies: isProduction
    ? {
        sessionToken: {
          name: '__Secure-authjs.session-token',
          options: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: true,
            domain: '.liminalcalendar.com',
          },
        },
        callbackUrl: {
          name: '__Secure-authjs.callback-url',
          options: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: true,
            domain: '.liminalcalendar.com',
          },
        },
      }
    : undefined,
  pages: {
    signIn: '/',
  },
});
