"use client";

import { LocateFixed } from "lucide-react";

export function LocateRankingButton({ userId }: { userId: number }) {
  return (
    <button className="btn btn-ghost ranking-locate-button" onClick={() => {
      const targets = document.querySelectorAll<HTMLElement>("[data-ranking-user-id]");
      const target = Array.from(targets).find((element) => element.dataset.rankingUserId === String(userId) && element.getClientRects().length > 0);
      if (!target) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
    }} type="button">
      <LocateFixed aria-hidden="true" size={16} />定位到我
    </button>
  );
}
