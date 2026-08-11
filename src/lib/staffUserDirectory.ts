import type { Prisma } from "@prisma/client";
import { buildPaginationMeta } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { getStudentRankingSummariesForUsers } from "@/lib/ranking";
import type { StaffRole } from "@/lib/staffAccess";

export const STAFF_USER_PAGE_SIZE = 50;
export const STAFF_USER_QUERY_MAX_CHARS = 100;

export async function getStaffUserPage({
  page = 1,
  pageSize = STAFF_USER_PAGE_SIZE,
  query = "",
  viewerRole,
}: {
  page?: number;
  pageSize?: number;
  query?: string;
  viewerRole: StaffRole;
}) {
  const normalizedQuery = query.trim().slice(0, STAFF_USER_QUERY_MAX_CHARS);
  const where: Prisma.UserWhereInput = {
    ...(viewerRole === "teacher" ? { role: "student" } : {}),
    ...(normalizedQuery
      ? { username: { contains: normalizedQuery } }
      : {}),
  };
  const skip = (page - 1) * pageSize;
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        studentProfile: {
          select: {
            aiAccessEnabled: true,
            customTitle: true,
            objectiveAiAccessEnabled: true,
          },
        },
        _count: { select: { submissions: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
    }),
  ]);
  const rankings = await getStudentRankingSummariesForUsers(users);
  const rankingByUserId = new Map(rankings.map((item) => [item.userId, item]));

  return {
    ...buildPaginationMeta({ page, pageSize, total }),
    query: normalizedQuery,
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      aiAccessEnabled: user.studentProfile?.aiAccessEnabled ?? false,
      objectiveAiAccessEnabled:
        user.studentProfile?.objectiveAiAccessEnabled ?? false,
      customTitle: user.studentProfile?.customTitle ?? "",
      ranking: rankingByUserId.get(user.id) ?? null,
      submissions: user._count.submissions,
    })),
  };
}
