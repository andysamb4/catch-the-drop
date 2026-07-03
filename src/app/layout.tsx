import type { Metadata, Viewport } from "next";
import { appleSplashScreens } from "@/lib/apple-splash";
import { ServiceWorkerRegister } from "@/components/layout/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "3-Day Drop & Climb",
  description:
    "Tracks 3-day drop/climb signals on your stock watchlist and logs your eToro trades.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/icon-167.png", sizes: "167x167", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Drop & Climb",
    statusBarStyle: "default",
    startupImage: appleSplashScreens,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0d9488",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
