import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  examFindFirst: vi.fn(),
  examRecordFindFirst: vi.fn(),
  examRecordFindUniqueOrThrow: vi.fn(),
  examRecordUpdateMany: vi.fn(),
  requireStaffApiUser: vi.fn(),
  transaction: vi.fn(),
  txExamFindFirst: vi.fn(),
  txExamRecordFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    exam: { findFirst: mocks.examFindFirst },
    examRecord: { findFirst: mocks.examRecordFindFirst },
  },
}));
vi.mock("@/lib/staffAccess", () => ({
  getExamAccessWhere: (user: { id: number; role: string }, examId: number) => ({
    id: examId,
    ...(user.role === "teacher" ? { createdById: user.id } : {}),
  }),
  requireStaffApiUser: mocks.requireStaffApiUser,
}));

function request(reason = "学生误触交卷") {
  return new NextRequest(
    "http://oj.local/api/admin/exams/5/records/20/resume",
    {
      body: JSON.stringify({ reason }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function context() {
  return { params: Promise.resolve({ id: "5", recordId: "20" }) };
}

describe("exam record resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffApiUser.mockResolvedValue({
      response: null,
      user: { id: 4, role: "teacher", username: "coach" },
    });
    mocks.examFindFirst.mockResolvedValue({ id: 5 });
    mocks.examRecordFindFirst.mockResolvedValue({ userId: 7 });
    mocks.examRecordUpdateMany.mockResolvedValue({ count: 1 });
    mocks.examRecordFindUniqueOrThrow.mockResolvedValue({
      id: 20,
      resumeLoginAllowed: true,
      status: "in_progress",
    });
    mocks.auditCreate.mockResolvedValue({ id: 30 });
    mocks.txExamFindFirst.mockReset().mockResolvedValue({
      durationMin: 60,
      id: 5,
      status: "published",
    });
    mocks.txExamRecordFindFirst
      .mockReset()
      .mockResolvedValueOnce({
        examId: 5,
        id: 20,
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        status: "submitted",
        user: { role: "student", username: "alice" },
        userId: 7,
      })
      .mockResolvedValueOnce(null);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        exam: { findFirst: mocks.txExamFindFirst },
        examRecord: {
          findFirst: mocks.txExamRecordFindFirst,
          findUniqueOrThrow: mocks.examRecordFindUniqueOrThrow,
          updateMany: mocks.examRecordUpdateMany,
        },
        examRecordResumeAudit: { create: mocks.auditCreate },
      }),
    );
  });

  it("restores an owned submitted record and writes an audit", async () => {
    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.examRecord.status).toBe("in_progress");
    expect(mocks.examRecordUpdateMany).toHaveBeenCalledWith({
      data: {
        resumeLoginAllowed: true,
        status: "in_progress",
        submittedAt: null,
        totalScore: null,
      },
      where: { id: 20, status: "submitted" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        examRecordId: 20,
        operatorId: 4,
        operatorRole: "teacher",
        operatorUsername: "coach",
        reason: "学生误触交卷",
      }),
    });
  });

  it("returns 404 when a teacher cannot see the exam", async () => {
    mocks.examFindFirst.mockResolvedValueOnce(null);

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects student accounts before reading the record", async () => {
    mocks.requireStaffApiUser.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "权限不足" }), {
        status: 403,
      }),
      user: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.examFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a reason outside the required length", async () => {
    const response = await POST(request("x"), context());

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects expired and already resumed records without writing an audit", async () => {
    mocks.txExamRecordFindFirst.mockReset().mockResolvedValueOnce({
      examId: 5,
      id: 20,
      startedAt: new Date(Date.now() - 65 * 60 * 1000),
      status: "submitted",
      user: { role: "student", username: "alice" },
      userId: 7,
    });

    const expiredResponse = await POST(request(), context());
    expect(expiredResponse.status).toBe(409);
    expect(mocks.auditCreate).not.toHaveBeenCalled();

    mocks.txExamRecordFindFirst.mockReset().mockResolvedValueOnce({
      examId: 5,
      id: 20,
      startedAt: new Date(),
      status: "in_progress",
      user: { role: "student", username: "alice" },
      userId: 7,
    });
    const resumedResponse = await POST(request(), context());
    expect(resumedResponse.status).toBe(409);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects records after the exam has ended", async () => {
    mocks.txExamFindFirst.mockResolvedValueOnce({
      durationMin: 60,
      id: 5,
      status: "ended",
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.examRecordUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("creates no audit when a concurrent transition wins", async () => {
    mocks.examRecordUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects recovery while the student has another active exam", async () => {
    mocks.txExamRecordFindFirst
      .mockReset()
      .mockResolvedValueOnce({
        examId: 5,
        id: 20,
        startedAt: new Date(),
        status: "submitted",
        user: { role: "student", username: "alice" },
        userId: 7,
      })
      .mockResolvedValueOnce({ examId: 6 });

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.examRecordUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
