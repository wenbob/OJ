import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { applyPointAdjustment } from "@/lib/ladder";
import { parsePointAdjustmentInput } from "@/lib/ladderShared";
import { ladderErrorResponse, ladderJson, revalidateLadderPages } from "@/lib/ladderApi";
import { readJsonWithLimit, REQUEST_LIMITS } from "@/lib/requestLimits";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;
  const { id } = await params;
  const studentId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(studentId) || studentId <= 0) return ladderJson({ error: "学生不存在" }, 404);
  try {
    const body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
    let input;
    try { input = parsePointAdjustmentInput(body); }
    catch (error) { return ladderJson({ error: (error as Error).message }, 400); }
    const result = await applyPointAdjustment(studentId, auth.user.id, input);
    revalidateLadderPages();
    return ladderJson(result);
  } catch (error) { return ladderErrorResponse(error); }
}
