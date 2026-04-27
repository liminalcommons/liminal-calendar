import { SignInChooser } from '@/components/auth/SignInChooser';

export const metadata = {
  title: 'Welcome — Liminal Commons Calendar',
};

export default function WelcomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-grove-bg p-4">
      <SignInChooser />
    </main>
  );
}
