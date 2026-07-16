import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  getSessionStateFromRequest,
  SESSION_COOKIE,
} from "./auth";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

function requestWithToken(token: string) {
  return new NextRequest("http://oj.local/api/auth/me", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

function legacyToken(payload: { id: number; role: string; username: string }) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Date.now() }),
  ).toString("base64url");
  const secret = process.env.SESSION_SECRET ?? "dev-only-change-me";
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

describe("database-backed session validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a student session replaced by a newer login", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 2,
      role: "student",
      sessionVersion: 8,
      username: "alice",
    });
    const token = createSessionToken({
      id: 2,
      role: "student",
      sessionVersion: 7,
      username: "alice",
    });

    await expect(getSessionStateFromRequest(requestWithToken(token))).resolves.toEqual({
      reason: "session_replaced",
      user: null,
    });
  });

  it("accepts only the current student version", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 2,
      role: "student",
      sessionVersion: 8,
      username: "alice-renamed",
    });
    const token = createSessionToken({
      id: 2,
      role: "student",
      sessionVersion: 8,
      username: "alice",
    });

    await expect(getSessionStateFromRequest(requestWithToken(token))).resolves.toEqual({
      reason: null,
      user: { id: 2, role: "student", username: "alice-renamed" },
    });
  });

  it("keeps legacy version-zero administrator cookies but rejects legacy students", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({
        id: 1,
        role: "admin",
        sessionVersion: 0,
        username: "admin",
      })
      .mockResolvedValueOnce({
        id: 2,
        role: "student",
        sessionVersion: 0,
        username: "alice",
      });

    const adminState = await getSessionStateFromRequest(
      requestWithToken(legacyToken({ id: 1, role: "admin", username: "admin" })),
    );
    const studentState = await getSessionStateFromRequest(
      requestWithToken(legacyToken({ id: 2, role: "student", username: "alice" })),
    );

    expect(adminState.user?.role).toBe("admin");
    expect(studentState).toEqual({ reason: "session_invalid", user: null });
  });

  it("rejects a token whose role no longer matches the database", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 2,
      role: "admin",
      sessionVersion: 4,
      username: "alice",
    });
    const token = createSessionToken({
      id: 2,
      role: "student",
      sessionVersion: 4,
      username: "alice",
    });

    await expect(getSessionStateFromRequest(requestWithToken(token))).resolves.toEqual({
      reason: "session_invalid",
      user: null,
    });
  });
});
