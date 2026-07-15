import { beforeEach, describe, expect, it, vi } from "vitest";
import { judgeCppCode } from "@/lib/judge";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  createSubmission: vi.fn(),
  findAssignment: vi.fn(),
  updateAssignmentProblem: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    user: { id: 7, username: "student", role: "student" },
    response: null,
  })),
}));

vi.mock("@/lib/judge", () => ({
  judgeCppCode: vi.fn(async () => ({
    caseResults: [
      {
        actualOutput: "3",
        caseIndex: 1,
        errorMessage: null,
        expectedOutput: "3",
        input: "1 2",
        runtimeMs: 2,
        status: "Accepted",
      },
    ],
    errorMessage: null,
    passedCount: 1,
    runtimeMs: 2,
    status: "Accepted",
    totalCount: 1,
  })),
}));

vi.mock("@/lib/judgeQueue", () => ({
  enqueueJudgeTask: vi.fn(async (task: () => Promise<unknown>) => task()),
}));

vi.mock("@/lib/settings", () => ({
  getJudgeDefaultSettings: vi.fn(async () => ({ memoryLimitMb: 128, timeLimitMs: 1000 })),
}));

const assignment = {
  problems: [{ id: 88 }],
  status: "active",
  studentId: 7,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback({
      learningAssignmentProblem: { updateMany: mocks.updateAssignmentProblem },
      submission: { create: mocks.createSubmission },
    })),
    learningAssignment: {
      findUnique: mocks.findAssignment,
    },
    problem: {
      findUnique: vi.fn(async () => ({
        id: 12,
        objectiveItems: null,
        problemType: "programming",
        testCases: [{ id: 1, input: "1 2", output: "3" }],
      })),
    },
  },
}));

function request(body: Record<string, unknown>) {
  return new Request("http://oj.local/api/problems/12/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "int main(){}", ...body }),
  });
}

describe("learning assignment submission attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValue(assignment as never);
    mocks.updateAssignmentProblem.mockResolvedValue({ count: 1 });
    mocks.createSubmission.mockResolvedValue({
      caseResults: [],
      errorMessage: null,
      id: 99,
      passedCount: 1,
      runtimeMs: 2,
      status: "Accepted",
      totalCount: 1,
    });
  });

  it("marks a correct assignment-linked practice Accepted in the same transaction", async () => {
    const response = await POST(
      request({ learningAssignmentId: 5 }) as never,
      { params: Promise.resolve({ id: "12" }) },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.countedForLearningAssignment).toBe(true);
    expect(mocks.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ learningAssignmentId: 5, submissionType: "practice" }),
      }),
    );
    expect(mocks.updateAssignmentProblem).toHaveBeenCalledWith({
      data: { completedAt: expect.any(Date) },
      where: { completedAt: null, id: 88 },
    });
  });

  it("does not credit a normal daily Accepted", async () => {
    const response = await POST(
      request({}) as never,
      { params: Promise.resolve({ id: "12" }) },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.countedForLearningAssignment).toBe(false);
    expect(mocks.updateAssignmentProblem).not.toHaveBeenCalled();
  });

  it("rejects another student's assignment before judging", async () => {
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValueOnce({
      ...assignment,
      studentId: 8,
    } as never);
    const response = await POST(
      request({ learningAssignmentId: 5 }) as never,
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(response.status).toBe(403);
    expect(judgeCppCode).not.toHaveBeenCalled();
  });

  it("rejects archived assignments and unrelated problems", async () => {
    vi.mocked(prisma.learningAssignment.findUnique)
      .mockResolvedValueOnce({ ...assignment, status: "archived" } as never)
      .mockResolvedValueOnce({ ...assignment, problems: [] } as never);
    const archived = await POST(
      request({ learningAssignmentId: 5 }) as never,
      { params: Promise.resolve({ id: "12" }) },
    );
    const unrelated = await POST(
      request({ learningAssignmentId: 5 }) as never,
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(archived.status).toBe(403);
    expect(unrelated.status).toBe(400);
  });

  it("rejects exam and assignment IDs used together", async () => {
    const response = await POST(
      request({ examId: 2, learningAssignmentId: 5 }) as never,
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(response.status).toBe(400);
    expect(prisma.problem.findUnique).not.toHaveBeenCalled();
  });
});
