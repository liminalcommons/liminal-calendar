'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useUser } from '@clerk/nextjs';
import { SignInChooser } from '@/components/auth/SignInChooser';

export default function WelcomePage() {
  const { status } = useSession();
  const { isSignedIn: clerkSignedIn, isLoaded: clerkLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading' || !clerkLoaded) return;
    if (status === 'authenticated' || clerkSignedIn) router.replace('/');
  }, [status, clerkSignedIn, clerkLoaded, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-grove-bg p-4">
      <SignInChooser />
    </main>
  );
}
