import { SignUp } from "@clerk/nextjs";

export const metadata = {
  title: "Sign up — Liminal Commons Calendar",
};

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--grove-bg))] p-4">
      <SignUp />
    </main>
  );
}
