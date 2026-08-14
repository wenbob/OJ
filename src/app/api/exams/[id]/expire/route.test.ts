import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  expireExamRecordIfNeeded: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/examScoring", () => ({
  expireExamRecordIfNeeded: mocks.expireExamRecordIfNeeded,
}));

function request() {
  return new NextRequest("http://oj.local/api/exams/4/expire", {
    method: "POST",
  });
}

describe("exam expiration authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 7, role: "student", username: "alice" },
    });
  });

  it("rejects an early client expiration request", async () => {
    mocks.expireExamRecordIfNeeded.mockResolvedValue({
      exam: { durationMin: 60, status: "published" },
      id: 20,
      status: "in_progress",
    });

    const response = await POST(request(), {
      params: Promise.resolve({ id: "4" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("尚未到截止时间");
    expect(body.examRecord.status).toBe("in_progress");
    expect(body.examRecord.exam).toBeUndefined();
  });

  it("returns the result only after the server confirms expiration", async () => {
    mocks.expireExamRecordIfNeeded.mockResolvedValue({
      id: 20,
      status: "expired",
    });

    const response = await POST(request(), {
      params: Promise.resolve({ id: "4" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.examRecord.status).toBe("expired");
    expect(body.resultHref).toBe("/student/exams/4/result");
  });

  it("keeps the missing-record response", async () => {
    mocks.expireExamRecordIfNeeded.mockResolvedValue(null);

    const response = await POST(request(), {
      params: Promise.resolve({ id: "4" }),
    });

    expect(response.status).toBe(404);
  });
});
