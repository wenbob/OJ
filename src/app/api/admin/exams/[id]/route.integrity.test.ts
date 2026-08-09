import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    exam: { findFirst: vi.fn() },
    examProblem: { findMany: vi.fn() },
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

function request(status: string, durationMin: number | null = 60) {
  return new NextRequest("http://oj.local/api/admin/exams/3", {
    body: JSON.stringify({
      aiEnabled: false,
      description: "",
      durationMin,
      examType: "programming",
      status,
      title: "正式考试",
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
}

describe("exam status transition integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
    mocks.prisma.exam.findFirst.mockResolvedValue({
      aiEnabled: false,
      description: null,
      durationMin: 60,
      examType: "programming",
      id: 3,
      status: "draft",
      title: "正式考试",
    });
  });

  it("does not let a draft exam skip directly to ended", async () => {
    const response = await PUT(request("ended"), {
      params: Promise.resolve({ id: "3" }),
    });

    expect(response.status).toBe(409);
    expect(mocks.prisma.examProblem.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires a positive duration before publishing through the edit route", async () => {
    mocks.prisma.examProblem.findMany.mockResolvedValue([]);

    const response = await PUT(request("published", null), {
      params: Promise.resolve({ id: "3" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "考试时长必须大于 0 分钟",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
