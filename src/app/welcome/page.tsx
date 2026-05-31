'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SignInChooser } from '@/components/auth/SignInChooser';

export default function WelcomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-grove-bg p-4">
      <SignInChooser />
    </main>
  );
}
