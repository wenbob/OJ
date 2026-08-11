import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PUT } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  requireStaffApiUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/staffAccess", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staffAccess")>(
    "@/lib/staffAccess",
  );
  return { ...actual, requireStaffApiUser: mocks.requireStaffApiUser };
});

function context() {
  return {
    params: Promise.resolve({ examProblemId: "8", id: "3" }),
  };
}

function updateRequest() {
  return new NextRequest("http://oj.local/api/admin/exams/3/problems/8", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 80 }),
  });
}

describe("exam problem edit integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
  });

  it("rechecks draft state before updating", async () => {
    const tx = {
      exam: {
        findFirst: vi.fn().mockResolvedValue({ id: 3, status: "published" }),
      },
      examProblem: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    mocks.prisma.$transaction.mockImplementationOnce(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await PUT(updateRequest(), context());

    expect(response.status).toBe(409);
    expect(tx.examProblem.updateMany).not.toHaveBeenCalled();
  });

  it("deletes only after the draft check in the same transaction", async () => {
    const tx = {
      exam: {
        findFirst: vi.fn().mockResolvedValue({ id: 3, status: "draft" }),
      },
      examProblem: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mocks.prisma.$transaction.mockImplementationOnce(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await DELETE(
      new NextRequest("http://oj.local/api/admin/exams/3/problems/8", {
        method: "DELETE",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(tx.exam.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.examProblem.deleteMany.mock.invocationCallOrder[0],
    );
  });
});
