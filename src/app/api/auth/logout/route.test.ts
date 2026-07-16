import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  clearSessionResponse: vi.fn((response) => response),
  examRecordFindMany: vi.fn(),
  finishExamRecord: vi.fn(),
  readSessionToken: vi.fn(),
  userUpdateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  clearSessionResponse: mocks.clearSessionResponse,
  readSessionToken: mocks.readSessionToken,
  SESSION_COOKIE: "oj_session",
}));
vi.mock("@/lib/examScoring", () => ({
  finishExamRecord: mocks.finishExamRecord,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    examRecord: { findMany: mocks.examRecordFindMany },
    user: { updateMany: mocks.userUpdateMany },
  },
}));
vi.mock("@/lib/requestSecurity", () => ({
  isSameOriginMutationRequest: () => true,
  sameOriginMutationErrorResponse: vi.fn(),
}));

function request() {
  return new NextRequest("http://oj.local/api/auth/logout", {
    headers: { cookie: "oj_session=token" },
    method: "POST",
  });
}

describe("student logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readSessionToken.mockReturnValue({
      id: 5,
      role: "student",
      sessionVersion: 7,
      username: "alice",
    });
    mocks.examRecordFindMany.mockResolvedValue([{ examId: 11 }]);
    mocks.finishExamRecord.mockResolvedValue({ status: "submitted" });
  });

  it("invalidates the current session and submits active exams", async () => {
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      data: { sessionVersion: { increment: 1 } },
      where: { id: 5, role: "student", sessionVersion: 7 },
    });
    expect(mocks.finishExamRecord).toHaveBeenCalledWith({
      examId: 11,
      status: "submitted",
      userId: 5,
    });
  });

  it("does not let a stale cookie submit the newer device exam", async () => {
    mocks.userUpdateMany.mockResolvedValue({ count: 0 });

    await POST(request());

    expect(mocks.examRecordFindMany).not.toHaveBeenCalled();
    expect(mocks.finishExamRecord).not.toHaveBeenCalled();
  });

  it("keeps administrator logout local to the current cookie", async () => {
    mocks.readSessionToken.mockReturnValue({
      id: 1,
      role: "admin",
      sessionVersion: 0,
      username: "admin",
    });

    await POST(request());

    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
    expect(mocks.finishExamRecord).not.toHaveBeenCalled();
  });
});
