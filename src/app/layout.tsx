import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liminal Calendar - Golden Hours for Global Communities",
  description: "Coordinate events across time zones with Golden Hours - optimal meeting times for distributed teams.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen" style={{ background: 'var(--parchment)' }}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
