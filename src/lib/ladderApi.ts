import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { LadderError } from "./ladderTransaction";
import { PayloadTooLargeError } from "./requestLimits";

export function ladderJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", ...(status === 503 ? { "Retry-After": "2" } : {}) } });
}
export function ladderErrorResponse(error: unknown) {
  if (error instanceof LadderError) return ladderJson({ error: error.message, ...(error.currentPoints !== undefined ? { currentPoints: error.currentPoints } : {}) }, error.status);
  if (error instanceof PayloadTooLargeError) return ladderJson({ error: error.message }, 413);
  if (error instanceof SyntaxError) return ladderJson({ error: "请求格式不合法" }, 400);
  console.error("[LADDER_OPERATION_FAILED]", { code: (error as { code?: string })?.code ?? "unknown" });
  return ladderJson({ error: "操作失败，请稍后重试" }, 500);
}
export function revalidateLadderPages() {
  revalidatePath("/student", "layout");
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin", "layout");
}
