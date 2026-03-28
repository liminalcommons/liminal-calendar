import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      hyloId?: string;
      role?: 'member' | 'host' | 'admin';
    };
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    hyloId?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    role?: 'member' | 'host' | 'admin';
  }
}
