import type { Metadata } from "next";
import "@/styles/globals.css";
import "@/styles/glitch-effects.css";
import { Providers } from "@/components/providers/Providers";

export const metadata: Metadata = {
  title: "Liminal Commons Calendar",
  description: "Community calendar for Liminal Commons",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
