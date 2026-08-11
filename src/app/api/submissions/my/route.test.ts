import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { submission: { count: mocks.count, findMany: mocks.findMany } },
}));

describe("GET /api/submissions/my visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 7, role: "student", username: "alice" },
    });
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([
      {
        code: "int main() {}",
        errorMessage: "HIDDEN_STDERR_LIST",
        id: 9,
        language: "C++17",
        problem: { id: 12, title: "测试题" },
        status: "Runtime Error",
      },
    ]);
  });

  it("redacts the top-level runtime error in both response aliases", async () => {
    const response = await GET(
      new NextRequest("http://oj.local/api/submissions/my?page=1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0].errorMessage).toBe("程序运行时异常");
    expect(body.submissions[0].errorMessage).toBe("程序运行时异常");
    expect(JSON.stringify(body)).not.toContain("HIDDEN_STDERR_LIST");
  });
});
