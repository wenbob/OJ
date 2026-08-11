import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    exam: { findFirst: vi.fn() },
    examRecord: { count: vi.fn() },
  },
  requireStaffApiUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/staffAccess", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staffAccess")>(
    "@/lib/staffAccess",
  );
  return { ...actual, requireStaffApiUser: mocks.requireStaffApiUser };
});

describe("exam unpublish integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
    mocks.prisma.exam.findFirst.mockResolvedValue({ id: 3, status: "published" });
  });

  it("does not clear snapshots after any student exam record exists", async () => {
    const tx = {
      exam: {
        findFirst: vi.fn().mockResolvedValue({ id: 3, status: "published" }),
        updateMany: vi.fn(),
      },
      examProblem: { updateMany: vi.fn() },
      examRecord: { count: vi.fn().mockResolvedValue(1) },
    };
    mocks.prisma.$transaction.mockImplementationOnce(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      new NextRequest("http://oj.local/api/admin/exams/3/unpublish", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "3" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("已有学生考试记录");
    expect(tx.examProblem.updateMany).not.toHaveBeenCalled();
  });
});
