import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const fixture = await vi.hoisted(async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os"); const path = await import("node:path");
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(path.join(tmpdir(), "oj-announcements-api-"));
  const file = path.join(dir, "test.db");
  const db = new DatabaseSync(file); db.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8")); db.close();
  return { dir, url: `file:${file.replaceAll("\\", "/")}` };
});
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: fixture.url } } }) };
});
import { prisma } from "@/lib/prisma";
import { createSessionToken, type Role } from "@/lib/auth";
import { announcementApi } from "./announcementApi";
const role = (id: number): Role => id === 3 ? "admin" : id === 2 ? "teacher" : "student";
function request(id: number | null, method = "GET", body?: unknown, foreign = false, query = "") {
  return new NextRequest(`http://oj.local/api/announcements${query}`, { method,
    headers: { ...(id ? { cookie: `oj_session=${createSessionToken({ id, username: `u${id}`, role: role(id), sessionVersion: 0 })}` } : {}),
      origin: foreign ? "https://foreign.local" : "http://oj.local", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeAll(async () => { await prisma.user.createMany({ data: [1, 2, 3].map((id) => ({ id, username: `u${id}`, role: role(id), passwordHash: "test" })) }); });
afterAll(async () => { await prisma.$disconnect(); const { rmSync } = await import("node:fs"); rmSync(fixture.dir, { recursive: true, force: true }); });
it("enforces actual session roles, CSRF, bounded inputs and private read state", async () => {
  for (const action of ["list", "pending", "detail", "read", "adminList", "publish", "withdraw"] as const) {
    const write = ["read", "publish", "withdraw"].includes(action);
    const response = await announcementApi(request(null, write ? "POST" : "GET"), action, ["detail", "read", "withdraw"].includes(action) ? "1" : undefined);
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  const body = { title: "通知", body: "正文", requestId: "request-notice-test-1" };
  for (const id of [1, 2]) {
    expect((await announcementApi(request(id, "POST", body), "publish")).status).toBe(403);
    expect((await announcementApi(request(id), "adminList")).status).toBe(403);
    expect((await announcementApi(request(id, "POST"), "withdraw", "1")).status).toBe(403);
  }
  expect((await announcementApi(request(3, "POST", body, true), "publish")).status).toBe(403);
  expect((await announcementApi(request(3, "POST", null), "publish")).status).toBe(400);
  expect((await announcementApi(request(3, "POST", { ...body, body: "x".repeat(33000) }), "publish")).status).toBe(413);
  const created = await announcementApi(request(3, "POST", body), "publish");
  expect(created.status).toBe(200); const { id } = await created.json();
  expect(await (await announcementApi(request(3, "POST", body), "publish")).json()).toEqual({ id });
  expect((await announcementApi(request(1, "POST", undefined, true), "read", String(id))).status).toBe(403);
  expect((await announcementApi(request(1, "POST"), "read", String(id))).status).toBe(200);
  expect((await (await announcementApi(request(1), "pending")).json()).unreadCount).toBe(0);
  expect((await (await announcementApi(request(2), "pending")).json()).unreadCount).toBe(1);
  expect((await (await announcementApi(request(2), "detail", String(id))).json()).read).toBe(false);
  expect((await announcementApi(request(1, "GET", undefined, false, "?page=-1"), "list")).status).toBe(400);
  expect((await announcementApi(request(1), "detail", "bad")).status).toBe(404);
  expect((await announcementApi(request(3, "POST", undefined, true), "withdraw", String(id))).status).toBe(403);
  expect((await announcementApi(request(3, "POST"), "withdraw", String(id))).status).toBe(200);
  expect((await announcementApi(request(2), "detail", String(id))).status).toBe(404);
});
