import { PageHeading } from "@/components/PageHeading";
import { RankEmblem } from "@/components/RankEmblem";
import type { RankTier } from "@/lib/ladderShared";

export function RankTierPath({ currentTierTitle, tiers: rankTiers, showRule = false }: { currentTierTitle?: string; tiers: readonly RankTier[]; showRule?: boolean }) {
  const currentIndex = rankTiers.findIndex((tier) => tier.title === currentTierTitle);
  return (
    <section aria-labelledby="tier-path-heading" className="rank-path">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeading as="h2" id="tier-path-heading" kind="leaderboard" size="section">段位成长之路</PageHeading>
        {showRule ? <p className="text-xs text-ink-600">每通过一道新题，积累 10 分</p> : null}
      </div>
      <ol className="rank-path-grid">
        {rankTiers.map((tier, index) => {
          const isCurrent = index === currentIndex;
          const state = currentIndex < 0 ? "preview" : isCurrent ? "current" : index < currentIndex ? "unlocked" : "locked";
          return (
            <li aria-current={isCurrent ? "step" : undefined} className="rank-path-step" data-state={state} key={tier.title}>
              <RankEmblem className="rank-emblem-path" tierTitle={tier.title} />
              <span className="rank-path-name">{tier.title}</span>
              <span className="rank-path-threshold data-number">{tier.minPoints}+ 分</span>
              <span className="rank-path-status">{isCurrent ? "当前段位" : state === "unlocked" ? "已达成" : state === "locked" ? "待挑战" : " "}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
