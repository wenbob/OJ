import { NextRequest, NextResponse } from "next/server";
import { attachSessionResponse, roleHome } from "@/lib/auth";
import {
  clearLoginFailures,
  getLoginRateLimitStatus,
  loginRateLimitKey,
  recordFailedLogin,
} from "@/lib/loginRateLimit";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import {
  isSameOriginMutationRequest,
  sameOriginMutationErrorResponse,
} from "@/lib/requestSecurity";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutationRequest(request)) {
    return sameOriginMutationErrorResponse();
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.authJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const username =
    typeof record.username === "string" ? record.username.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
  }

  const rateLimitKey = loginRateLimitKey(request, username);
  const rateLimitStatus = getLoginRateLimitStatus(rateLimitKey);
  if (rateLimitStatus.limited) {
    return NextResponse.json(
      {
        error: `登录尝试过于频繁，请 ${rateLimitStatus.retryAfterSeconds} 秒后再试`,
        retryAfterSeconds: rateLimitStatus.retryAfterSeconds,
      },
      {
        headers: { "Retry-After": String(rateLimitStatus.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailedLogin(rateLimitKey);
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  if (user.role !== "student" && user.role !== "admin") {
    return NextResponse.json({ error: "账号角色异常" }, { status: 403 });
  }

  const safeUser = {
    id: user.id,
    username: user.username,
    role: user.role as "student" | "admin",
  };
  const response = NextResponse.json({
    user: safeUser,
    redirectTo: roleHome(user.role),
  });

  clearLoginFailures(rateLimitKey);
  return attachSessionResponse(response, safeUser);
}
