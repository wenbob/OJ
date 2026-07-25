import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  attachSessionResponse: vi.fn((response) => response),
  examRecordFindMany: vi.fn(),
  finishExamRecord: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  attachSessionResponse: mocks.attachSessionResponse,
  roleHome: (role: string) =>
    role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/student",
}));
vi.mock("@/lib/examScoring", () => ({
  finishExamRecord: mocks.finishExamRecord,
}));
vi.mock("@/lib/loginRateLimit", () => ({
  clearLoginFailures: vi.fn(),
  getLoginRateLimitStatus: () => ({ limited: false, retryAfterSeconds: 0 }),
  loginRateLimitKey: () => "test-key",
  recordFailedLogin: vi.fn(),
}));
vi.mock("@/lib/password", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    examRecord: { findMany: mocks.examRecordFindMany },
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));
vi.mock("@/lib/requestSecurity", () => ({
  isSameOriginMutationRequest: () => true,
  sameOriginMutationErrorResponse: vi.fn(),
}));

function request() {
  return new Request("http://oj.local/api/auth/login", {
    body: JSON.stringify({ password: "secret123", username: "alice" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }) as NextRequest;
}

describe("login session rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.examRecordFindMany.mockResolvedValue([]);
    mocks.finishExamRecord.mockResolvedValue({ status: "submitted" });
  });

  it("finishes active exams before issuing a new student session", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 3,
      passwordHash: "hash",
      role: "student",
      sessionVersion: 5,
      username: "alice",
    });
    mocks.examRecordFindMany.mockResolvedValue([{ examId: 10 }, { examId: 12 }]);
    mocks.userUpdate.mockResolvedValue({
      id: 3,
      role: "student",
      sessionVersion: 6,
      username: "alice",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.finishExamRecord).toHaveBeenCalledTimes(2);
    expect(mocks.finishExamRecord).toHaveBeenNthCalledWith(1, {
      examId: 10,
      status: "submitted",
      userId: 3,
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      data: { sessionVersion: { increment: 1 } },
      select: {
        id: true,
        role: true,
        sessionVersion: true,
        username: true,
      },
      where: { id: 3 },
    });
    expect(mocks.finishExamRecord.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.userUpdate.mock.invocationCallOrder[0],
    );
    expect(mocks.attachSessionResponse).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ sessionVersion: 6 }),
    );
  });

  it("keeps administrator sessions multi-device by not rotating the version", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 1,
      passwordHash: "hash",
      role: "admin",
      sessionVersion: 2,
      username: "admin",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.examRecordFindMany).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.attachSessionResponse).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ role: "admin", sessionVersion: 2 }),
    );
  });

  it("keeps teacher sessions multi-device and redirects to the teacher portal", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 4,
      passwordHash: "hash",
      role: "teacher",
      sessionVersion: 3,
      username: "coach",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe("/teacher");
    expect(mocks.examRecordFindMany).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.attachSessionResponse).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ role: "teacher", sessionVersion: 3 }),
    );
  });
});
