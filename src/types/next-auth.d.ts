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
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    hyloId?: string;
    role?: 'member' | 'host' | 'admin';
  }
}
