import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isSameOriginMutationRequest,
  sameOriginMutationErrorResponse,
} from "@/lib/requestSecurity";

export type Role = "student" | "admin";

export type CurrentUser = {
  id: number;
  username: string;
  role: Role;
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
  return role === "admin" ? "/admin" : "/student";
}

export function createSessionToken(user: CurrentUser) {
  const body = base64Url(
    JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role,
      iat: Date.now(),
    }),
  );
  return `${body}.${signBody(body)}`;
}

export function readSessionToken(token?: string): CurrentUser | null {
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
      (payload.role !== "student" && payload.role !== "admin") ||
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
    };
  } catch {
    return null;
  }
}

async function hydrateUser(session: CurrentUser | null) {
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, username: true, role: true },
  });
  if (!user || (user.role !== "student" && user.role !== "admin")) return null;
  return user as CurrentUser;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return hydrateUser(readSessionToken(cookieStore.get(SESSION_COOKIE)?.value));
}

export async function getUserFromRequest(request: NextRequest) {
  return hydrateUser(readSessionToken(request.cookies.get(SESSION_COOKIE)?.value));
}

export async function requirePageUser(role?: Role) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect(roleHome(user.role));
  return user;
}

export async function requireApiUser(request: NextRequest, role?: Role) {
  if (!isSameOriginMutationRequest(request)) {
    return {
      user: null,
      response: sameOriginMutationErrorResponse(),
    };
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    };
  }
  if (role && user.role !== role) {
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
    secure: shouldUseSecureCookies(),
  });
  return response;
}

export function attachSessionResponse(response: NextResponse, user: CurrentUser) {
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: shouldUseSecureCookies(),
  });
  return response;
}

function shouldUseSecureCookies() {
  const configured = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.APP_ORIGIN?.trim().toLowerCase().startsWith("https://") ?? false;
}
