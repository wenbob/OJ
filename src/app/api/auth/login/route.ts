import { NextRequest, NextResponse } from "next/server";
import { attachSessionResponse, roleHome } from "@/lib/auth";
import {
  clearLoginFailures,
  getLoginRateLimitStatus,
  loginIpRateLimitKey,
  loginRateLimitKey,
  recordFailedLogin,
  recordFailedLoginForIp,
  reserveLoginVerification,
} from "@/lib/loginRateLimit";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { settleStudentExamsForLoginAndRotateSession } from "@/lib/examScoring";
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
  const ipRateLimitKey = loginIpRateLimitKey(request);
  const rateLimitStatuses = [
    getLoginRateLimitStatus(rateLimitKey),
    getLoginRateLimitStatus(ipRateLimitKey),
  ];
  const retryAfterSeconds = Math.max(
    ...rateLimitStatuses
      .filter((status) => status.limited)
      .map((status) => status.retryAfterSeconds),
    0,
  );
  if (retryAfterSeconds > 0) {
    return NextResponse.json(
      {
        error: `登录尝试过于频繁，请 ${retryAfterSeconds} 秒后再试`,
        retryAfterSeconds,
      },
      {
        headers: { "Retry-After": String(retryAfterSeconds) },
        status: 429,
      },
    );
  }

  const reservation = reserveLoginVerification(rateLimitKey, ipRateLimitKey);
  if (!reservation.allowed) {
    return NextResponse.json(
      {
        error: "登录验证正在处理中，请稍后再试",
        retryAfterSeconds: reservation.retryAfterSeconds,
      },
      {
        headers: { "Retry-After": String(reservation.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  let user;
  let passwordMatches = false;
  try {
    user = await prisma.user.findUnique({ where: { username } });
    passwordMatches = Boolean(
      user && (await verifyPassword(password, user.passwordHash)),
    );
  } finally {
    reservation.release();
  }
  if (!user || !passwordMatches) {
    recordFailedLogin(rateLimitKey);
    recordFailedLoginForIp(ipRateLimitKey);
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  if (
    user.role !== "student" &&
    user.role !== "teacher" &&
    user.role !== "admin"
  ) {
    return NextResponse.json({ error: "账号角色异常" }, { status: 403 });
  }

  let sessionUser;
  if (user.role === "student") {
    sessionUser = await settleStudentExamsForLoginAndRotateSession(user.id);
  } else {
    sessionUser = {
      id: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
      username: user.username,
    };
  }

  const safeUser = {
    id: sessionUser.id,
    username: sessionUser.username,
    role: sessionUser.role as "student" | "teacher" | "admin",
  };
  const response = NextResponse.json({
    user: safeUser,
    redirectTo: roleHome(user.role),
  });

  clearLoginFailures(rateLimitKey);
  return attachSessionResponse(response, {
    ...safeUser,
    sessionVersion: sessionUser.sessionVersion,
  });
}
