import { LeaderboardHero } from "@/components/LeaderboardHero";
import { RankTierPath } from "@/components/RankTierPath";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { requirePageUser } from "@/lib/auth";
import { findRankingByUserId, getStudentRankings } from "@/lib/ranking";
import { getLadderSettingsForRender } from "@/lib/ladderSettings";

export default async function StudentLeaderboardPage() {
  const e2eDelayMs = Number(process.env.E2E_NAVIGATION_DELAY_MS);
  if (Number.isFinite(e2eDelayMs) && e2eDelayMs > 0 && e2eDelayMs <= 2_000) {
    await new Promise((resolve) => setTimeout(resolve, e2eDelayMs));
  }
  const user = await requirePageUser("student");
  const settings = await getLadderSettingsForRender();
  const rankings = await getStudentRankings(undefined, settings.tiers);
  const currentRanking = findRankingByUserId(rankings, user.id);

  return (
    <>
      <section className="surface overflow-hidden">
        <LeaderboardHero role="student" />
        <LeaderboardTable currentUserId={user.id} rankings={rankings} tiers={settings.tiers} />
        <RankTierPath currentTierTitle={currentRanking?.tierTitle} tiers={settings.tiers} />
      </section>
    </>
  );
}
