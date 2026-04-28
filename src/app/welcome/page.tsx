import { redirect } from 'next/navigation';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { auth as nextAuth } from '../../../auth';
import { SignInChooser } from '@/components/auth/SignInChooser';

export const metadata = {
  title: 'Welcome — Liminal Commons Calendar',
};

export default async function WelcomePage() {
  const [clerk, hylo] = await Promise.all([clerkAuth(), nextAuth()]);
  if (clerk.userId || hylo?.user) redirect('/');
  return (
    <main className="flex min-h-screen items-center justify-center bg-grove-bg p-4">
      <SignInChooser />
    </main>
  );
}
