import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getPointAdjustmentPage } from "@/lib/ladder";
import { LADDER_PAGE_SIZE, type PointAdjustmentMode } from "@/lib/ladderShared";
import { readPaginationFromUrl } from "@/lib/pagination";
import { ladderErrorResponse, ladderJson } from "@/lib/ladderApi";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") || undefined;
  const studentId = params.has("studentId") ? Number(params.get("studentId")) : undefined;
  if (mode && !["add", "deduct", "set"].includes(mode)) return ladderJson({ error: "操作类型不合法" }, 400);
  if (studentId !== undefined && (!Number.isSafeInteger(studentId) || studentId <= 0)) return ladderJson({ error: "学生编号不合法" }, 400);
  try { return ladderJson(await getPointAdjustmentPage({ ...readPaginationFromUrl(params, LADDER_PAGE_SIZE), query: params.get("q") ?? "", mode: mode as PointAdjustmentMode | undefined, studentId })); }
  catch (error) { return ladderErrorResponse(error); }
}
