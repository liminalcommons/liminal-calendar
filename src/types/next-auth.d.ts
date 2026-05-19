import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      logtoUserId?: string;
      role?: 'member' | 'host' | 'admin';
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    logtoUserId?: string;
    role?: 'member' | 'host' | 'admin';
  }
}
