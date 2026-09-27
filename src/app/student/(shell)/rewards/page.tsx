import { RewardsPanel } from "@/components/RewardsPanel";
import { requirePageUser } from "@/lib/auth";

export default async function StudentRewardsPage() {
  await requirePageUser("student");
  return <RewardsPanel />;
}
