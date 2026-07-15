import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DELETE } from "./route";

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    user: { id: 1, username: "admin", role: "admin" },
    response: null,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    learningAssignment: {
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

function request() {
  return new Request("http://oj.local/api/admin/learning/assignments/12", {
    method: "DELETE",
  });
}

const context = { params: Promise.resolve({ id: "12" }) };

describe("DELETE /api/admin/learning/assignments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValue({
      id: 12,
      status: "archived",
    } as never);
    vi.mocked(prisma.learningAssignment.delete).mockResolvedValue({ id: 12 } as never);
  });

  it("permanently deletes an archived assignment", async () => {
    const response = await DELETE(request() as never, context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(prisma.learningAssignment.delete).toHaveBeenCalledWith({ where: { id: 12 } });
  });

  it("requires active assignments to be archived first", async () => {
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValueOnce({
      id: 12,
      status: "active",
    } as never);
    const response = await DELETE(request() as never, context);
    expect(response.status).toBe(409);
    expect(prisma.learningAssignment.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the assignment no longer exists", async () => {
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValueOnce(null);
    const response = await DELETE(request() as never, context);
    expect(response.status).toBe(404);
    expect(prisma.learningAssignment.delete).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers before reading assignment data", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "权限不足" }), { status: 403 }) as never,
    });
    const response = await DELETE(request() as never, context);
    expect(response.status).toBe(403);
    expect(prisma.learningAssignment.findUnique).not.toHaveBeenCalled();
  });
});
