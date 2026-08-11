import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  examFindUnique: vi.fn(),
  examRecordCreate: vi.fn(),
  examRecordFindFirst: vi.fn(),
  examRecordFindUnique: vi.fn(),
  finishExamRecord: vi.fn(),
  isExamExpired: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/examScoring", () => ({
  finishExamRecord: mocks.finishExamRecord,
  isExamExpired: mocks.isExamExpired,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        exam: { findUnique: mocks.examFindUnique },
        examRecord: {
          findFirst: mocks.examRecordFindFirst,
          findUnique: mocks.examRecordFindUnique,
          upsert: mocks.examRecordCreate,
        },
      }),
    ),
    exam: { findUnique: mocks.examFindUnique },
    examRecord: {
      upsert: mocks.examRecordCreate,
      findFirst: mocks.examRecordFindFirst,
      findUnique: mocks.examRecordFindUnique,
    },
  },
}));

function request() {
  return new NextRequest("http://oj.local/api/exams/5/start", {
    method: "POST",
  });
}

describe("exam start active-record guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 7, role: "student", username: "alice" },
    });
    mocks.examFindUnique.mockResolvedValue({
      durationMin: 60,
      id: 5,
      status: "published",
    });
    mocks.examRecordFindUnique.mockResolvedValue(null);
    mocks.examRecordFindFirst.mockResolvedValue(null);
    mocks.examRecordCreate.mockResolvedValue({
      examId: 5,
      id: 20,
      status: "in_progress",
      userId: 7,
    });
    mocks.isExamExpired.mockReturnValue(false);
  });

  it("redirects to another in-progress exam instead of creating a second one", async () => {
    mocks.examRecordFindFirst.mockResolvedValue({ examId: 6 });

    const response = await POST(request(), {
      params: Promise.resolve({ id: "5" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.redirectTo).toBe("/student/exams/6/take");
    expect(mocks.examRecordCreate).not.toHaveBeenCalled();
    expect(mocks.examRecordFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          examId: { not: 5 },
          status: "in_progress",
          userId: 7,
        },
      }),
    );
  });

  it("creates the record when no other exam is in progress", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: "5" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.redirectTo).toBe("/student/exams/5/take");
    expect(mocks.examRecordCreate).toHaveBeenCalledWith({
      create: { examId: 5, userId: 7 },
      update: {},
      where: { examId_userId: { examId: 5, userId: 7 } },
    });
  });

  it("continues the current exam without consulting the second-exam guard", async () => {
    mocks.examRecordFindUnique.mockResolvedValue({
      examId: 5,
      id: 20,
      startedAt: new Date(),
      status: "in_progress",
      userId: 7,
    });

    const response = await POST(request(), {
      params: Promise.resolve({ id: "5" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe("/student/exams/5/take");
    expect(mocks.examRecordFindFirst).not.toHaveBeenCalled();
    expect(mocks.examRecordCreate).not.toHaveBeenCalled();
  });

  it("serializes duplicate starts and reuses the existing record", async () => {
    const existing = {
      examId: 5,
      id: 20,
      startedAt: new Date(),
      status: "in_progress",
      userId: 7,
    };
    mocks.examRecordFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mocks.examRecordCreate.mockResolvedValueOnce(existing);

    const [first, second] = await Promise.all([
      POST(request(), { params: Promise.resolve({ id: "5" }) }),
      POST(request(), { params: Promise.resolve({ id: "5" }) }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(mocks.examRecordCreate).toHaveBeenCalledTimes(1);
  });
});
