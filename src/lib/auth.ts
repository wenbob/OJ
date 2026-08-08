import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shouldUseSecureSessionCookies } from "@/lib/env";
import {
  isSameOriginMutationRequest,
  sameOriginMutationErrorResponse,
} from "@/lib/requestSecurity";

export type Role = "student" | "teacher" | "admin";

export type CurrentUser = {
  id: number;
  username: string;
  role: Role;
};

export type SessionUser = CurrentUser & {
  sessionVersion: number;
};

export type SessionInvalidReason =
  | "unauthenticated"
  | "session_invalid"
  | "session_replaced";

export type SessionState = {
  reason: SessionInvalidReason | null;
  user: CurrentUser | null;
};

type SessionClaims = CurrentUser & {
  sessionVersion?: number;
};

export const SESSION_COOKIE = "oj_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

const secret = process.env.SESSION_SECRET ?? "dev-only-change-me";

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signBody(body: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

export function roleHome(role: string) {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  return "/student";
}

function isRole(value: unknown): value is Role {
  return value === "student" || value === "teacher" || value === "admin";
}

function matchesRequiredRole(
  actualRole: Role,
  requiredRole?: Role | readonly Role[],
) {
  if (!requiredRole) return true;
  return Array.isArray(requiredRole)
    ? requiredRole.includes(actualRole)
    : actualRole === requiredRole;
}

export function createSessionToken(user: SessionUser) {
  const body = base64Url(
    JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role,
      sessionVersion: user.sessionVersion,
      iat: Date.now(),
    }),
  );
  return `${body}.${signBody(body)}`;
}

export function readSessionToken(token?: string): SessionClaims | null {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = signBody(body);
  if (signature.length !== expected.length) return null;
  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof payload.id !== "number" ||
      typeof payload.username !== "string" ||
      !isRole(payload.role) ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    const tokenAgeMs = Date.now() - payload.iat;
    if (tokenAgeMs < 0 || tokenAgeMs > SESSION_MAX_AGE_MS) return null;
    return {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      ...(typeof payload.sessionVersion === "number"
        ? { sessionVersion: payload.sessionVersion }
        : {}),
    };
  } catch {
    return null;
  }
}

async function hydrateSession(
  session: SessionClaims | null,
): Promise<SessionState> {
  if (!session) return { reason: "unauthenticated", user: null };
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, username: true, role: true, sessionVersion: true },
  });
  if (
    !user ||
    !isRole(user.role) ||
    user.role !== session.role
  ) {
    return { reason: "session_invalid", user: null };
  }

  // Legacy administrator cookies did not contain a version. Version zero keeps
  // those sessions valid, while old student cookies must log in again once.
  const tokenVersion =
    typeof session.sessionVersion === "number"
      ? session.sessionVersion
      : user.role === "admin"
        ? 0
        : null;
  if (tokenVersion === null) {
    return { reason: "session_invalid", user: null };
  }
  if (tokenVersion !== user.sessionVersion) {
    return {
      reason: user.role === "student" ? "session_replaced" : "session_invalid",
      user: null,
    };
  }

  return {
    reason: null,
    user: { id: user.id, role: user.role, username: user.username },
  };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const state = await hydrateSession(
    readSessionToken(cookieStore.get(SESSION_COOKIE)?.value),
  );
  return state.user;
}

export async function getCurrentSessionState() {
  const cookieStore = await cookies();
  return hydrateSession(readSessionToken(cookieStore.get(SESSION_COOKIE)?.value));
}

export async function getUserFromRequest(request: NextRequest) {
  const state = await getSessionStateFromRequest(request);
  return state.user;
}

export async function getSessionStateFromRequest(request: NextRequest) {
  return hydrateSession(
    readSessionToken(request.cookies.get(SESSION_COOKIE)?.value),
  );
}

export async function requirePageUser(role?: Role | readonly Role[]) {
  const state = await getCurrentSessionState();
  const user = state.user;
  if (!user) {
    if (state.reason === "session_replaced") {
      redirect("/login?reason=session_replaced");
    }
    if (state.reason === "session_invalid") {
      redirect("/login?reason=session_invalid");
    }
    redirect("/login");
  }
  if (!matchesRequiredRole(user.role, role)) redirect(roleHome(user.role));
  return user;
}

export async function requireApiUser(
  request: NextRequest,
  role?: Role | readonly Role[],
) {
  if (!isSameOriginMutationRequest(request)) {
    return {
      user: null,
      response: sameOriginMutationErrorResponse(),
    };
  }

  const state = await getSessionStateFromRequest(request);
  const user = state.user;
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        {
          error:
            state.reason === "session_replaced"
              ? "账号已在其他设备登录，请重新登录"
              : state.reason === "unauthenticated"
                ? "请先登录"
                : "登录状态已失效，请重新登录",
          reason: state.reason,
        },
        { status: 401 },
      ),
    };
  }
  if (!matchesRequiredRole(user.role, role)) {
    return {
      user: null,
      response: NextResponse.json({ error: "权限不足" }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export function clearSessionResponse(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: shouldUseSecureSessionCookies(),
  });
  return response;
}

export function attachSessionResponse(response: NextResponse, user: SessionUser) {
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: shouldUseSecureSessionCookies(),
  });
  return response;
}
