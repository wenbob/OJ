"use client";

import { useEffect } from "react";

const CHECK_INTERVAL_MS = 30_000;

export function SessionPresenceGuard() {
  useEffect(() => {
    let disposed = false;
    let checking = false;

    async function checkSession() {
      if (disposed || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status !== 401 || disposed) return;
        const data = await response.json().catch(() => ({}));
        const reason =
          data.reason === "session_replaced"
            ? "session_replaced"
            : "session_invalid";
        window.location.replace(`/login?reason=${reason}`);
      } catch {
        // A temporary network failure is not evidence that another device
        // replaced the session. The next focus/interval check will retry.
      } finally {
        checking = false;
      }
    }

    const onFocus = () => void checkSession();
    window.addEventListener("focus", onFocus);
    const intervalId = window.setInterval(() => void checkSession(), CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
