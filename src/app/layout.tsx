import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import "@/styles/glitch-effects.css";
import { Providers } from "@/components/providers/Providers";
import { BugReportFab } from "@/components/BugReportFab";
import { SubscribePrompt } from "@/components/SubscribePrompt";
import { MobileRedirect } from "@/components/MobileRedirect";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NotificationScheduler } from "@/components/NotificationScheduler";

export const metadata: Metadata = {
  title: "Liminal Commons Calendar",
  description: "Community calendar for Liminal Commons",
  icons: {
    icon: '/favicon.svg',
    apple: '/icon-192.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Calendar',
  },
};

export const viewport: Viewport = {
  themeColor: '#c4935a',
  width: 'device-width',
  initialScale: 1,
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
          <MobileRedirect />
          <SubscribePrompt />
          <ServiceWorkerRegistration />
          <InstallPrompt />
          <NotificationScheduler />
          <BugReportFab />
        </Providers>
      </body>
    </html>
  );
}
