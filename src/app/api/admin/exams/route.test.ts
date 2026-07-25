import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  examCreate: vi.fn(),
  examFindMany: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    exam: {
      create: mocks.examCreate,
      findMany: mocks.examFindMany,
    },
  },
}));

function getRequest() {
  return new NextRequest("http://oj.local/api/admin/exams");
}

function postRequest(body: unknown) {
  return new NextRequest("http://oj.local/api/admin/exams", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("staff exam collection access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 7, role: "teacher", username: "coach" },
    });
    mocks.examFindMany.mockResolvedValue([]);
    mocks.examCreate.mockResolvedValue({
      id: 21,
      title: "老师考试",
    });
  });

  it("lists only exams created by the current teacher", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(mocks.examFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          _count: { select: { problems: true } },
          createdBy: { select: { id: true, role: true, username: true } },
        },
        where: { createdById: 7 },
      }),
    );
  });

  it("records the current teacher as the owner of a new exam", async () => {
    const response = await POST(
      postRequest({
        aiEnabled: true,
        durationMin: 60,
        examType: "programming",
        status: "draft",
        title: "老师考试",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.examCreate).toHaveBeenCalledWith({
      data: {
        aiEnabled: true,
        createdById: 7,
        description: null,
        durationMin: 60,
        examType: "programming",
        status: "draft",
        title: "老师考试",
      },
    });
  });
});
