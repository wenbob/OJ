import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  finishExamRecord: vi.fn(),
  findUnique: vi.fn(),
  isExamExpired: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/examScoring", () => ({
  finishExamRecord: mocks.finishExamRecord,
  isExamExpired: mocks.isExamExpired,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { examRecord: { findUnique: mocks.findUnique } },
}));

function request() {
  return new NextRequest("http://oj.local/api/exams/4/submit", {
    method: "POST",
  });
}

describe("exam submit idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 7, role: "student", username: "alice" },
    });
  });

  it("returns an already-finished record without scoring twice", async () => {
    mocks.findUnique.mockResolvedValue({
      exam: { durationMin: 60, status: "published" },
      id: 20,
      status: "submitted",
      totalScore: 80,
    });

    const response = await POST(request(), {
      params: Promise.resolve({ id: "4" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.examRecord.totalScore).toBe(80);
    expect(mocks.finishExamRecord).not.toHaveBeenCalled();
  });
});
