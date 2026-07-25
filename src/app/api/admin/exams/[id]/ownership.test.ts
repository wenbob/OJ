import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET } from "./route";

const mocks = vi.hoisted(() => ({
  examDelete: vi.fn(),
  examFindFirst: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    exam: {
      delete: mocks.examDelete,
      findFirst: mocks.examFindFirst,
    },
  },
}));

const context = { params: Promise.resolve({ id: "18" }) };

function request(method = "GET") {
  return new NextRequest("http://oj.local/api/admin/exams/18", { method });
}

describe("teacher exam ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 7, role: "teacher", username: "coach" },
    });
  });

  it("queries an exam with both its id and current teacher id", async () => {
    mocks.examFindFirst.mockResolvedValue(null);

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.examFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdById: 7, id: 18 },
      }),
    );
  });

  it("returns 404 and does not delete another teacher's exam", async () => {
    mocks.examFindFirst.mockResolvedValue(null);

    const response = await DELETE(request("DELETE"), context);

    expect(response.status).toBe(404);
    expect(mocks.examDelete).not.toHaveBeenCalled();
  });
});
