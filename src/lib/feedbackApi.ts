import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, type CurrentUser, type Role } from "@/lib/auth";
import { FeedbackError } from "@/lib/feedbackErrors";

export async function feedbackApi(
  request: NextRequest,
  roles: Role | readonly Role[],
  handler: (user: CurrentUser) => Promise<Response>,
) {
  let response: Response;
  try {
    const auth = await requireApiUser(request, roles);
    response = auth.response ?? await handler(auth.user!);
  } catch (error) {
    // Do not log upstream/Prisma errors: they may contain private form data.
    const known = error instanceof FeedbackError;
    response = NextResponse.json({ error: known ? error.message : "反馈服务暂时不可用，请稍后重试" }, {
      status: known ? error.status : 500,
      headers: known && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
    });
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
