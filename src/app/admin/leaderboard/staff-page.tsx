// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { Trophy } from "lucide-react";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getStudentRankings } from "@/lib/ranking";
import {
  getStaffBasePath,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

export async function StaffLeaderboardPage({ role }: { role: StaffRole }) {
  await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const rankings = await getStudentRankings();

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 bg-ink-950 p-5 text-linen md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="arena-kicker text-[#d7a062]">
                {role === "admin" ? "Ladder Admin" : "Ladder Teacher"}
              </p>
              <h1 className="mt-2 text-3xl font-black">天梯管理台</h1>
              <p className="mt-2 text-sm font-semibold text-[#e5ded0]">
                实时读取历史提交计算，不写积分缓存表。
              </p>
              <p className="mt-1 text-xs font-semibold text-[#c8c0b2]">
                排名按积分、唯一 AC、AC 次数、用户名和用户 ID 依次排序。
              </p>
            </div>
            <Link className="btn border-[#d6a44a]/35 bg-[#d6a44a]/10 text-[#f2d28c]" href={`${basePath}/users`}>
              <Trophy size={16} />
              管理学生头衔
            </Link>
          </div>
        </div>
        <LeaderboardTable rankings={rankings} showAdminColumns />
      </section>
    </>
  );
}

export default function AdminLeaderboardPage() {
  return <StaffLeaderboardPage role="admin" />;
}
