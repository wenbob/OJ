import { NextRequest, NextResponse } from "next/server";
import { getAiUsageStudentDetail, readAiUsageFilters } from "@/lib/aiUsage";
import { readPaginationFromUrl } from "@/lib/pagination";
import { requireStaffApiUser } from "@/lib/staffAccess";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const studentId = Number((await context.params).studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return NextResponse.json({ error: "学生 ID 不合法" }, { status: 400 });
  }

  const searchParams = new URL(request.url).searchParams;
  const filters = readAiUsageFilters(searchParams);
  const { page, pageSize } = readPaginationFromUrl(searchParams);
  const detail = await getAiUsageStudentDetail({
    filters,
    page,
    pageSize,
    studentId,
  });
  if (!detail) {
    return NextResponse.json({ error: "学生不存在" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
