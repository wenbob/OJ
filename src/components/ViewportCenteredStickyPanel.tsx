"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

const DESKTOP_MEDIA_QUERY = "(min-width: 1280px)";
export const VIEWPORT_STICKY_GUTTER_PX = 24;

export function calculateViewportCenteredStickyTop({
  contentHeight,
  gutter = VIEWPORT_STICKY_GUTTER_PX,
  viewportHeight,
}: {
  contentHeight: number;
  gutter?: number;
  viewportHeight: number;
}) {
  if (
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return gutter;
  }

  const availableHeight = Math.max(0, viewportHeight - gutter * 2);
  const panelHeight = Math.min(Math.max(0, contentHeight), availableHeight);
  return Math.max(gutter, Math.round((viewportHeight - panelHeight) / 2));
}

export function ViewportCenteredStickyPanel({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [stickyTop, setStickyTop] = useState(VIEWPORT_STICKY_GUTTER_PX);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !enabled) return;

    const desktopQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const updateStickyTop = () => {
      if (!desktopQuery.matches) {
        setStickyTop(VIEWPORT_STICKY_GUTTER_PX);
        return;
      }

      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const nextTop = calculateViewportCenteredStickyTop({
        contentHeight: panel.scrollHeight,
        viewportHeight,
      });
      setStickyTop((currentTop) =>
        currentTop === nextTop ? currentTop : nextTop,
      );
    };

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateStickyTop);
    observer?.observe(panel);
    desktopQuery.addEventListener("change", updateStickyTop);
    window.addEventListener("resize", updateStickyTop);
    window.visualViewport?.addEventListener("resize", updateStickyTop);
    updateStickyTop();

    return () => {
      observer?.disconnect();
      desktopQuery.removeEventListener("change", updateStickyTop);
      window.removeEventListener("resize", updateStickyTop);
      window.visualViewport?.removeEventListener("resize", updateStickyTop);
    };
  }, [enabled]);

  return (
    <aside
      className={`grid content-start gap-4 xl:self-start ${
        enabled
          ? "xl:sticky xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:overscroll-contain"
          : ""
      }`}
      data-viewport-centered-sticky={enabled ? "true" : undefined}
      ref={panelRef}
      style={enabled ? { top: stickyTop } : undefined}
    >
      {children}
    </aside>
  );
}
