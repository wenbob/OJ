import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

function request() {
  return new NextRequest("http://oj.local/api/admin/exams/3/problems", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ problemId: 12, score: 100 }),
  });
}

function createTx(status = "draft") {
  return {
    exam: {
      findFirst: vi.fn().mockResolvedValue({
        examType: "programming",
        id: 3,
        status,
      }),
    },
    problem: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 12,
          objectiveItems: null,
          problemType: "programming",
          title: "A+B",
        },
      ]),
    },
    examProblem: {
      aggregate: vi.fn().mockResolvedValue({ _max: { order: 0 } }),
      create: vi.fn().mockResolvedValue({ id: 8, problemId: 12 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe("exam problem creation integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
  });

  it("checks draft state and creates the row inside one transaction", async () => {
    const tx = createTx();
    mocks.prisma.$transaction.mockImplementationOnce(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(request(), {
      params: Promise.resolve({ id: "3" }),
    });

    expect(response.status).toBe(201);
    expect(tx.exam.findFirst).toHaveBeenCalled();
    expect(tx.examProblem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ examId: 3, problemId: 12 }),
      }),
    );
  });

  it("does not add a problem after the exam becomes published", async () => {
    const tx = createTx("published");
    mocks.prisma.$transaction.mockImplementationOnce(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(request(), {
      params: Promise.resolve({ id: "3" }),
    });

    expect(response.status).toBe(409);
    expect(tx.examProblem.create).not.toHaveBeenCalled();
  });
});
