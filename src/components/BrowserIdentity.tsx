"use client";

import { useEffect } from "react";
import {
  resolveBrowserTitle,
  type BrowserIdentitySettings,
} from "@/lib/browserIdentity";

const browserIdentityEvent = "oj-browser-identity-updated";

function applyBrowserIdentity(settings: BrowserIdentitySettings) {
  document.title = resolveBrowserTitle(settings);

  const serverIcons = document.head.querySelectorAll<HTMLLinkElement>(
    'link[rel~="icon"]:not([data-oj-browser-icon="true"])',
  );
  const current = document.head.querySelector<HTMLLinkElement>(
    'link[data-oj-browser-icon="true"]',
  );
  if (!settings.browserIcon) {
    current?.remove();
    serverIcons.forEach((link) => {
      if (link.href.startsWith("data:image/")) link.remove();
    });
    return;
  }

  const link = current ?? document.createElement("link");
  link.dataset.ojBrowserIcon = "true";
  link.rel = "icon";
  link.type = settings.browserIcon.slice(5, settings.browserIcon.indexOf(";"));
  link.href = settings.browserIcon;
  if (!current) document.head.appendChild(link);
}

export function notifyBrowserIdentityUpdated(settings: BrowserIdentitySettings) {
  window.dispatchEvent(
    new CustomEvent<BrowserIdentitySettings>(browserIdentityEvent, { detail: settings }),
  );
}

export function BrowserIdentity({
  initialSettings,
}: {
  initialSettings: BrowserIdentitySettings;
}) {
  useEffect(() => {
    applyBrowserIdentity(initialSettings);

    const handleUpdate = (event: Event) => {
      const settings = (event as CustomEvent<BrowserIdentitySettings>).detail;
      if (settings) applyBrowserIdentity(settings);
    };
    window.addEventListener(browserIdentityEvent, handleUpdate);
    return () => {
      window.removeEventListener(browserIdentityEvent, handleUpdate);
    };
  }, [initialSettings]);

  return null;
}
