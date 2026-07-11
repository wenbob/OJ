import { Crown, Shield } from "lucide-react";
import { getRankVisualKey } from "@/lib/rankVisual";

export function RankEmblem({
  className = "",
  tierTitle,
}: {
  className?: string;
  tierTitle: string;
}) {
  const tier = getRankVisualKey(tierTitle);
  const Icon = tier === "king" || tier === "glory" ? Crown : Shield;

  return (
    <span
      aria-label={`${tierTitle}段位徽章`}
      className={`rank-emblem ${className}`}
      data-tier={tier}
      title={tierTitle}
    >
      <Icon aria-hidden="true" size={className.includes("rank-emblem-sm") ? 17 : 22} strokeWidth={2.4} />
    </span>
  );
}
