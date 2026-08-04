import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireStaffApiUser } from "@/lib/staffAccess";
import { PATCH } from "./route";

const tx = {
  studentProfile: { upsert: vi.fn(async () => ({})) },
  user: { findMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));

vi.mock("@/lib/staffAccess", () => ({
  requireStaffApiUser: vi.fn(async () => ({
    response: null,
    user: { id: 3, role: "teacher", username: "coach" },
  })),
}));

function request(body: unknown) {
  return new Request("http://oj.local/api/admin/users/ai-access/bulk", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

describe("PATCH /api/admin/users/ai-access/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaffApiUser).mockResolvedValue({
      response: null,
      user: { id: 3, role: "teacher", username: "coach" },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );
  });

  it("updates the objective permission for every validated student", async () => {
    tx.user.findMany.mockResolvedValueOnce([{ id: 8 }, { id: 9 }]);
    const response = await PATCH(
      request({
        enabled: true,
        profile: "objective",
        userIds: [8, 9],
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: "objective",
      updatedCount: 2,
    });
    expect(tx.studentProfile.upsert).toHaveBeenCalledTimes(2);
    expect(tx.studentProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { objectiveAiAccessEnabled: true },
      }),
    );
  });

  it("rolls back before writes when any target is not a student", async () => {
    tx.user.findMany.mockResolvedValueOnce([{ id: 8 }]);
    const response = await PATCH(
      request({
        enabled: false,
        profile: "objective",
        userIds: [8, 99],
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("未修改任何权限"),
    });
    expect(tx.studentProfile.upsert).not.toHaveBeenCalled();
  });

  it("rejects duplicate IDs before opening a transaction", async () => {
    const response = await PATCH(
      request({
        enabled: true,
        profile: "objective",
        userIds: [8, 8],
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("preserves the staff authorization response", async () => {
    vi.mocked(requireStaffApiUser).mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "权限不足" }), {
        status: 403,
      }) as never,
      user: null as never,
    });
    const response = await PATCH(
      request({ enabled: true, profile: "objective", userIds: [8] }) as never,
    );

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
