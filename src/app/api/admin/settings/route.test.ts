import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import { defaultSystemSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { PUT } from "./route";

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    user: { id: 1, username: "admin", role: "admin" },
    response: null,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    systemSetting: {
      upsert: vi.fn(async () => ({})),
    },
  },
}));

const pngIcon = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString("base64")}`;

function request(body: unknown, contentLength?: number) {
  return new Request("http://oj.local/api/admin/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a validated browser title and PNG icon", async () => {
    const response = await PUT(request({
      ...defaultSystemSettings,
      browserTitle: "好好练题",
      browserIcon: pngIcon,
    }) as never);
    expect(response.status).toBe(200);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { key: "browserTitle", value: "好好练题" },
      }),
    );
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { key: "browserIcon", value: pngIcon },
      }),
    );
  });

  it("rejects icon content disguised as PNG", async () => {
    const response = await PUT(request({
      ...defaultSystemSettings,
      browserIcon: "data:image/png;base64,SGVsbG8=",
    }) as never);
    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects settings requests above the dedicated limit", async () => {
    const response = await PUT(request(defaultSystemSettings, 512 * 1024 + 1) as never);
    expect(response.status).toBe(413);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "权限不足" }), { status: 403 }) as never,
    });
    const response = await PUT(request(defaultSystemSettings) as never);
    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
