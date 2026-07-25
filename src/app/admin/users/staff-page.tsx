// Shared server page for administrator and teacher shells.
import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { getStudentRankings } from "@/lib/ranking";
import {
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { UserManager } from "./user-manager";

export async function StaffUsersPage({ role }: { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const [users, rankings] = await Promise.all([
    prisma.user.findMany({
      where: role === "teacher" ? { role: "student" } : undefined,
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        studentProfile: {
          select: { aiAccessEnabled: true, customTitle: true },
        },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getStudentRankings(),
  ]);
  const rankingByUserId = new Map(rankings.map((item) => [item.userId, item]));

  return (
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <UserManager
        initialUsers={users.map((item) => ({
          id: item.id,
          username: item.username,
          role: item.role,
          createdAt: item.createdAt.toISOString(),
          aiAccessEnabled: item.studentProfile?.aiAccessEnabled ?? false,
          customTitle: item.studentProfile?.customTitle ?? "",
          ranking: rankingByUserId.get(item.id) ?? null,
          submissions: item._count.submissions,
        }))}
        viewerRole={role}
      />
    </AppShell>
  );
}

export default function AdminUsersPage() {
  return <StaffUsersPage role="admin" />;
}
