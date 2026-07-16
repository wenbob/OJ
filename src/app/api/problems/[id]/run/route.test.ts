import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import { isExamSubmissionOnTime } from "@/lib/examScoring";
import { runCppCode } from "@/lib/judge";
import { enqueueJudgeTask, JudgeQueueFullError } from "@/lib/judgeQueue";
import { reserveProblemRun } from "@/lib/problemRunRateLimit";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cancelReservation: vi.fn(),
  completeReservation: vi.fn(),
  createSubmission: vi.fn(),
  enqueue: vi.fn(),
  examFind: vi.fn(),
  examRecordFind: vi.fn(),
  isOnTime: vi.fn(),
  problemFind: vi.fn(),
  reserve: vi.fn(),
  runCpp: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.auth }));
vi.mock("@/lib/examScoring", () => ({
  isExamSubmissionOnTime: mocks.isOnTime,
}));
vi.mock("@/lib/judge", () => ({ runCppCode: mocks.runCpp }));
vi.mock("@/lib/judgeQueue", () => {
  class MockJudgeQueueFullError extends Error {}
  return {
    JudgeQueueFullError: MockJudgeQueueFullError,
    enqueueJudgeTask: mocks.enqueue,
  };
});
vi.mock("@/lib/problemRunRateLimit", () => ({
  PROBLEM_RUN_COOLDOWN_MS: 5000,
  reserveProblemRun: mocks.reserve,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    exam: { findUnique: mocks.examFind },
    examRecord: { findUnique: mocks.examRecordFind },
    problem: { findUnique: mocks.problemFind },
    submission: { create: mocks.createSubmission },
  },
}));
vi.mock("@/lib/settings", () => ({
  getJudgeDefaultSettings: vi.fn(async () => ({
    memoryLimitMb: 128,
    timeLimitMs: 1000,
  })),
}));

const publicProblem = {
  problemType: "programming",
  sampleInput: "legacy input",
  sampleOutput: "legacy output",
  testCases: [
    { id: 1, input: "1 2", output: "3" },
    { id: 2, input: "4 5", output: "9" },
  ],
};

function request(body: Record<string, unknown>) {
  return new Request("http://oj.local/api/problems/12/run", {
    body: JSON.stringify({ code: "int main(){}", ...body }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function context() {
  return { params: Promise.resolve({ id: "12" }) };
}

describe("problem trial run API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      response: null,
      user: { id: 7, role: "student", username: "student" },
    });
    mocks.problemFind.mockResolvedValue(publicProblem);
    mocks.examFind.mockResolvedValue({
      durationMin: 60,
      examType: "programming",
      problems: [{ id: 1 }],
      status: "published",
    });
    mocks.examRecordFind.mockResolvedValue({
      startedAt: new Date(),
      status: "in_progress",
    });
    mocks.isOnTime.mockReturnValue(true);
    mocks.reserve.mockReturnValue({
      allowed: true,
      cancel: mocks.cancelReservation,
      complete: mocks.completeReservation,
    });
    mocks.enqueue.mockImplementation(async (task: () => Promise<unknown>) => task());
    mocks.runCpp.mockResolvedValue({
      cases: [
        {
          actualOutput: "3",
          caseIndex: 1,
          expectedOutput: "3",
          input: "1 2",
          runtimeMs: 2,
          status: "matched",
        },
        {
          actualOutput: "9",
          caseIndex: 2,
          expectedOutput: "9",
          input: "4 5",
          runtimeMs: 2,
          status: "matched",
        },
      ],
      runtimeMs: 4,
      status: "sample_passed",
    });
  });

  it("runs all server-owned public samples once without creating a submission", async () => {
    const response = await POST(request({ mode: "samples" }) as never, context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.status).toBe("sample_passed");
    expect(runCppCode).toHaveBeenCalledTimes(1);
    expect(runCppCode).toHaveBeenCalledWith({
      code: "int main(){}",
      expectedOutputs: ["3", "9"],
      inputs: ["1 2", "4 5"],
      memoryLimitMb: 128,
      timeLimitMs: 1000,
    });
    expect(enqueueJudgeTask).toHaveBeenCalledWith(expect.any(Function), {
      priority: "trial",
    });
    expect(prisma.problem.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          testCases: expect.objectContaining({ where: { isSample: true } }),
        }),
      }),
    );
    expect(mocks.createSubmission).not.toHaveBeenCalled();
    expect(mocks.completeReservation).toHaveBeenCalledOnce();
  });

  it("runs empty custom input without attaching a standard output", async () => {
    mocks.runCpp.mockResolvedValueOnce({
      cases: [
        {
          actualOutput: "hello",
          caseIndex: 1,
          input: "",
          runtimeMs: 2,
          status: "completed",
        },
      ],
      runtimeMs: 2,
      status: "completed",
    });

    const response = await POST(
      request({ customInput: "", mode: "custom" }) as never,
      context(),
    );

    expect(response.status).toBe(200);
    expect(runCppCode).toHaveBeenCalledWith(
      expect.objectContaining({ expectedOutputs: undefined, inputs: [""] }),
    );
  });

  it("rejects browser-provided sample data before querying the problem", async () => {
    const response = await POST(
      request({ expectedOutput: "fake", mode: "samples" }) as never,
      context(),
    );

    expect(response.status).toBe(400);
    expect(prisma.problem.findUnique).not.toHaveBeenCalled();
    expect(runCppCode).not.toHaveBeenCalled();
  });

  it("keeps custom input available when no public sample exists", async () => {
    mocks.problemFind.mockResolvedValueOnce({
      ...publicProblem,
      sampleInput: "",
      sampleOutput: "",
      testCases: [],
    });
    const sampleResponse = await POST(
      request({ mode: "samples" }) as never,
      context(),
    );

    mocks.problemFind.mockResolvedValueOnce({
      ...publicProblem,
      sampleInput: "",
      sampleOutput: "",
      testCases: [],
    });
    const customResponse = await POST(
      request({ customInput: "1", mode: "custom" }) as never,
      context(),
    );

    expect(sampleResponse.status).toBe(400);
    expect(customResponse.status).toBe(200);
  });

  it("rejects objective problems, oversized input, and assignment attribution", async () => {
    mocks.problemFind.mockResolvedValueOnce({
      ...publicProblem,
      problemType: "objective",
    });
    const objectiveResponse = await POST(
      request({ mode: "samples" }) as never,
      context(),
    );
    const oversizedResponse = await POST(
      request({ customInput: "x".repeat(32 * 1024 + 1), mode: "custom" }) as never,
      context(),
    );
    const assignmentResponse = await POST(
      request({ learningAssignmentId: 9, mode: "custom" }) as never,
      context(),
    );

    expect(objectiveResponse.status).toBe(400);
    expect(oversizedResponse.status).toBe(413);
    expect(assignmentResponse.status).toBe(400);
  });

  it("rechecks active exam membership and deadline before running", async () => {
    const valid = await POST(
      request({ examId: 4, mode: "samples" }) as never,
      context(),
    );
    expect(valid.status).toBe(200);
    expect(isExamSubmissionOnTime).toHaveBeenCalled();

    mocks.isOnTime.mockReturnValueOnce(false);
    const expired = await POST(
      request({ examId: 4, mode: "samples" }) as never,
      context(),
    );
    expect(expired.status).toBe(403);
  });

  it("returns 429 for an active or cooling-down user", async () => {
    mocks.reserve.mockReturnValueOnce({
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds: 4,
    });
    const response = await POST(request({ mode: "samples" }) as never, context());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.retryAfterSeconds).toBe(4);
    expect(runCppCode).not.toHaveBeenCalled();
  });

  it("returns 503 and releases the reservation when the judge queue is full", async () => {
    mocks.enqueue.mockRejectedValueOnce(new JudgeQueueFullError());
    const response = await POST(request({ mode: "samples" }) as never, context());

    expect(response.status).toBe(503);
    expect(reserveProblemRun).toHaveBeenCalled();
    expect(mocks.cancelReservation).toHaveBeenCalledOnce();
  });

  it("returns an authentication response without reading problem data", async () => {
    mocks.auth.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "请先登录" }), {
        status: 401,
      }),
      user: null,
    });
    const response = await POST(request({ mode: "samples" }) as never, context());

    expect(response.status).toBe(401);
    expect(requireApiUser).toHaveBeenCalled();
    expect(prisma.problem.findUnique).not.toHaveBeenCalled();
  });
});
