import { SignIn } from "@clerk/nextjs";

export const metadata = {
  title: "Sign in — Liminal Commons Calendar",
};

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--grove-bg))] p-4">
      <SignIn />
    </main>
  );
}
