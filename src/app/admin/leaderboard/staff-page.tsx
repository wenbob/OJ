// Shared server page for administrator and teacher shells.
import { LeaderboardHero } from "@/components/LeaderboardHero";
import { RankTierPath } from "@/components/RankTierPath";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getStudentRankings } from "@/lib/ranking";
import { getLadderSettingsForRender } from "@/lib/ladderSettings";
import {
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

export async function StaffLeaderboardPage({ role }: { role: StaffRole }) {
  await requireStaffPageUser(role);
  const settings = await getLadderSettingsForRender();
  const rankings = await getStudentRankings(undefined, settings.tiers);

  return (
    <>
      <section className="surface overflow-hidden">
        <LeaderboardHero role={role} />
        <LeaderboardTable rankings={rankings} showAdminColumns tiers={settings.tiers} />
        <RankTierPath tiers={settings.tiers} showRule />
      </section>
    </>
  );
}

export default function AdminLeaderboardPage() {
  return <StaffLeaderboardPage role="admin" />;
}
