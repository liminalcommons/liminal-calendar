import type { Metadata } from "next";
import "@/styles/globals.css";
import "@/styles/glitch-effects.css";
import { Providers } from "@/components/providers/Providers";
import { BugReportFab } from "@/components/BugReportFab";
import { SubscribePrompt } from "@/components/SubscribePrompt";

export const metadata: Metadata = {
  title: "Liminal Commons Calendar",
  description: "Community calendar for Liminal Commons",
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>
          {children}
          <SubscribePrompt />
          <BugReportFab />
        </Providers>
      </body>
    </html>
  );
}
