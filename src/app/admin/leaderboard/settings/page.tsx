import { requirePageUser } from "@/lib/auth";
import { getLadderSettingsForRender } from "@/lib/ladderSettings";
import { getLadderStudentPage, getPointAdjustmentPage } from "@/lib/ladder";
import { LADDER_PAGE_SIZE } from "@/lib/ladderShared";
import { LadderManager } from "./ladder-manager";

export default async function LadderSettingsPage() {
  await requirePageUser("admin");
  const settings = await getLadderSettingsForRender();
  const [students, adjustments] = await Promise.all([
    getLadderStudentPage({ page: 1, pageSize: LADDER_PAGE_SIZE, tiers: settings.tiers }),
    getPointAdjustmentPage({ page: 1, pageSize: LADDER_PAGE_SIZE }),
  ]);
  return <LadderManager initialSettings={settings} initialStudents={students} initialAdjustments={adjustments} />;
}
