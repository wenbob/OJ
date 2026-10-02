"use client";

import Image from "next/image";
import { useState } from "react";
import { Crown, Shield } from "lucide-react";
import { getRankVisualKey, type RankVisualKey } from "@/lib/rankVisual";

export function RankEmblem({
  className = "",
  eager = false,
  tierTitle,
}: {
  className?: string;
  eager?: boolean;
  tierTitle: string;
}) {
  const tier = getRankVisualKey(tierTitle);
  return <EmblemImage className={className} eager={eager} key={tier} tier={tier} tierTitle={tierTitle} />;
}

function EmblemImage({ className, eager, tier, tierTitle }: {
  className: string; eager: boolean; tier: RankVisualKey; tierTitle: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const Icon = tier === "king" || tier === "glory" ? Crown : Shield;

  return (
    <span
      aria-label={`${tierTitle}段位徽章`}
      className={`rank-emblem ${className}`}
      data-image-state={state}
      data-tier={tier}
      role="img"
      title={tierTitle}
    >
      <span aria-hidden="true" className="rank-emblem-fallback"><Icon size={28} strokeWidth={1.8} /></span>
      {state !== "failed" ? (
        <Image
          alt=""
          className="rank-emblem-image"
          height={320}
          loading={eager ? "eager" : "lazy"}
          onError={() => setState("failed")}
          onLoad={() => setState("loaded")}
          src={`/ui/ranks/${tier}.webp`}
          unoptimized
          width={320}
        />
      ) : null}
    </span>
  );
}
