export const MAX_BROWSER_ICON_BYTES = 256 * 1024;

export type BrowserIdentitySettings = {
  browserIcon: string;
  browserTitle: string;
  siteName: string;
};

export function resolveBrowserTitle(settings: Pick<BrowserIdentitySettings, "browserTitle" | "siteName">) {
  return settings.browserTitle.trim() || settings.siteName.trim() || "C++ OJ Demo";
}
