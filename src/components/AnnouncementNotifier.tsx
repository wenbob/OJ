"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnnouncementModal } from "./AnnouncementModal";
import { useAutomaticOverlay } from "@/lib/automaticOverlay";
import type { AnnouncementPending } from "@/lib/announcementShared";

export const ANNOUNCEMENTS_UPDATED = "oj-announcements-updated";
export function notifyAnnouncementsUpdated() {
  window.dispatchEvent(new Event(ANNOUNCEMENTS_UPDATED));
  // Cross-tab signalling only; the database remains the read-state authority.
  try { localStorage.setItem(ANNOUNCEMENTS_UPDATED, String(Date.now())); } catch { /* storage may be disabled */ }
}

export function AnnouncementNotifier() {
  const pathname = usePathname();
  const [data, setData] = useState<AnnouncementPending | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const currentRequest = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const revision = ++generation.current;
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    try {
      const response = await fetch("/api/announcements/pending", { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setData(null);
        throw new Error("暂时无法检查公告，请稍后重试");
      }
      const result = await response.json();
      if (!controller.signal.aborted && revision === generation.current) setData(result);
    } catch { /* Polling failure must not interrupt work or falsely mark read. */ }
  }, []);
  useEffect(() => {
    const refresh = () => { void reload(); };
    const frame = requestAnimationFrame(refresh);
    const timer = setInterval(refresh, 30_000);
    window.addEventListener(ANNOUNCEMENTS_UPDATED, refresh);
    const storage = (event: StorageEvent) => { if (event.key === ANNOUNCEMENTS_UPDATED) refresh(); };
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      currentRequest.current?.abort();
      cancelAnimationFrame(frame); clearInterval(timer);
      window.removeEventListener(ANNOUNCEMENTS_UPDATED, refresh);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload, pathname]);
  const announcement = data?.announcement;
  const visible = useAutomaticOverlay(Boolean(announcement && !data?.blockedByExam), 10);
  async function acknowledge() {
    if (!announcement || inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    ++generation.current; currentRequest.current?.abort();
    try {
      const response = await fetch(`/api/announcements/${announcement.id}/read`, { method: "POST", signal: AbortSignal.timeout(15_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "确认失败，请重试");
      setData(null);
      notifyAnnouncementsUpdated();
    } catch (reason) { setError(reason instanceof Error && !(reason instanceof TypeError) && !(reason instanceof SyntaxError) && reason.name !== "TimeoutError" ? reason.message : "网络异常或超时，确认未完成，请重试"); }
    finally { inFlight.current = false; setPending(false); }
  }
  if (!visible || !announcement) return null;
  return <AnnouncementModal title={announcement.title}>
    <div className="min-h-0 flex-1 overflow-y-auto p-5" tabIndex={0}>
      <p className="mb-4 text-xs text-steel">{new Date(announcement.publishedAt).toLocaleString("zh-CN")} · {data!.unreadCount} 条未读</p>
      <p className="whitespace-pre-wrap break-words leading-7">{announcement.body}</p>
    </div>
    <footer className="shrink-0 border-t border-ink-950/10 p-4">
      {error && <p className="mb-3 text-sm text-red-700" role="alert">{error}</p>}
      <button className="btn btn-primary w-full" disabled={pending} onClick={() => void acknowledge()}>{pending ? "正在确认…" : "我知道了"}</button>
    </footer>
  </AnnouncementModal>;
}
