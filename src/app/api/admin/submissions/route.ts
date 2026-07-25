import { NextRequest, NextResponse } from "next/server";
import {
  buildAdminSubmissionWhere,
  readAdminSubmissionFiltersFromUrl,
} from "@/lib/adminSubmissionFilters";
import {
  buildPaginationMeta,
  readPaginationFromUrl,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  getStaffSubmissionWhere,
  requireStaffApiUser,
} from "@/lib/staffAccess";

export async function GET(request: NextRequest) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const filters = readAdminSubmissionFiltersFromUrl(request.nextUrl.searchParams);
  const { page, pageSize, skip } = readPaginationFromUrl(request.nextUrl.searchParams);
  const where = {
    AND: [
      buildAdminSubmissionWhere(filters),
      getStaffSubmissionWhere(auth.user),
    ],
    submissionType: "practice",
  };
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, role: true } },
        problem: { select: { id: true, title: true } },
        exam: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.submission.count({ where }),
  ]);

  return NextResponse.json({
    items: submissions,
    submissions,
    ...buildPaginationMeta({ page, pageSize, total }),
  });
}
