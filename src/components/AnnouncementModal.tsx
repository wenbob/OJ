"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function AnnouncementModal({ title, children }: { title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>("[data-app-shell-root]");
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const wasInert = shell?.hasAttribute("inert");
    const hidden = shell?.getAttribute("aria-hidden");
    shell?.setAttribute("inert", "");
    shell?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) ref.current?.focus();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      if (event.key !== "Tab") return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length) { event.preventDefault(); ref.current?.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("focusin", focus, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      if (!wasInert) shell?.removeAttribute("inert");
      if (hidden == null) shell?.removeAttribute("aria-hidden"); else shell?.setAttribute("aria-hidden", hidden);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/60 p-3 sm:p-6">
    <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
      className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden border border-ink-950/15 bg-[#fffaf1] shadow-2xl">
      <div className="h-1.5 shrink-0 bg-clay" />
      <header className="shrink-0 border-b border-ink-950/10 px-5 py-4">
        <p className="arena-kicker">平台公告</p><h2 className="mt-2 break-words text-xl font-black">{title}</h2>
      </header>
      {children}
    </section>
  </div>, document.body);
}
