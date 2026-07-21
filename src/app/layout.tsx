import type { Metadata, Viewport } from "next";
import { BrowserIdentity } from "@/components/BrowserIdentity";
import { resolveBrowserTitle } from "@/lib/browserIdentity";
import { getPublicSettings } from "@/lib/settings";
import "katex/dist/katex.min.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  return {
    title: resolveBrowserTitle(settings),
    description: `${settings.siteName} - ${settings.siteSubtitle}`,
    icons: settings.browserIcon
      ? {
          icon: [{
            url: settings.browserIcon,
            type: settings.browserIcon.slice(5, settings.browserIcon.indexOf(";")),
          }],
        }
      : undefined,
  };
}

export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-sans antialiased">
        <BrowserIdentity />
        {children}
      </body>
    </html>
  );
}
