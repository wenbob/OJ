import type { Metadata, Viewport } from "next";
import { BrowserIdentity } from "@/components/BrowserIdentity";
import { SiteComplianceFooter } from "@/components/SiteComplianceFooter";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getPublicSettings();

  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <BrowserIdentity initialSettings={settings} />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <SiteComplianceFooter settings={settings} />
      </body>
    </html>
  );
}
