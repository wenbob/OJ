import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import {
  replaceLearningAssignmentProblems,
  validateLearningAssignmentProblemItems,
} from "@/lib/learningAssignments";
import { prisma } from "@/lib/prisma";
import { DELETE, PATCH } from "./route";

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    user: { id: 1, username: "admin", role: "admin" },
    response: null,
  })),
}));

vi.mock("@/lib/learningAssignments", () => ({
  replaceLearningAssignmentProblems: vi.fn(async () => ({
    addedProblemCount: 1,
    removedProblemCount: 1,
    unlinkedSubmissionCount: 2,
  })),
  validateLearningAssignmentProblemItems: vi.fn(() => ({
    data: [{ assignmentProblemId: 31 }, { problemId: 52 }],
    error: null,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    learningAssignment: {
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

function request() {
  return new Request("http://oj.local/api/admin/learning/assignments/12", {
    method: "DELETE",
  });
}

function patchRequest(body: unknown) {
  return new Request("http://oj.local/api/admin/learning/assignments/12", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

const context = { params: Promise.resolve({ id: "12" }) };

function createTx() {
  return {
    learningAssignment: {
      findUnique: vi.fn().mockResolvedValue({
        createdById: 1,
        id: 12,
        status: "active",
        studentId: 7,
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 12,
        problems: [],
        status: "active",
      }),
      update: vi.fn().mockResolvedValue({ id: 12 }),
    },
  };
}

describe("DELETE /api/admin/learning/assignments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValue({
      createdById: 1,
      id: 12,
      status: "archived",
    } as never);
    vi.mocked(prisma.learningAssignment.delete).mockResolvedValue({ id: 12 } as never);
    vi.mocked(validateLearningAssignmentProblemItems).mockReturnValue({
      data: [{ assignmentProblemId: 31 }, { problemId: 52 }],
      error: null,
    });
    vi.mocked(replaceLearningAssignmentProblems).mockResolvedValue({
      addedProblemCount: 1,
      removedProblemCount: 1,
      unlinkedSubmissionCount: 2,
    });
  });

  it("permanently deletes an archived assignment", async () => {
    const response = await DELETE(request() as never, context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(prisma.learningAssignment.delete).toHaveBeenCalledWith({ where: { id: 12 } });
  });

  it("requires active assignments to be archived first", async () => {
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValueOnce({
      createdById: 1,
      id: 12,
      status: "active",
    } as never);
    const response = await DELETE(request() as never, context);
    expect(response.status).toBe(409);
    expect(prisma.learningAssignment.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the assignment no longer exists", async () => {
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValueOnce(null);
    const response = await DELETE(request() as never, context);
    expect(response.status).toBe(404);
    expect(prisma.learningAssignment.delete).not.toHaveBeenCalled();
  });

  it("lets a teacher delete their own archived assignment", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: { id: 7, username: "coach", role: "teacher" },
      response: null,
    });
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValueOnce({
      createdById: 7,
      id: 12,
      status: "archived",
    } as never);

    const response = await DELETE(request() as never, context);

    expect(response.status).toBe(200);
    expect(prisma.learningAssignment.delete).toHaveBeenCalledWith({
      where: { id: 12 },
    });
  });

  it("hides another teacher's assignment behind a 404", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: { id: 7, username: "coach", role: "teacher" },
      response: null,
    });
    vi.mocked(prisma.learningAssignment.findUnique).mockResolvedValueOnce({
      createdById: 8,
      id: 12,
      status: "archived",
    } as never);

    const response = await DELETE(request() as never, context);

    expect(response.status).toBe(404);
    expect(prisma.learningAssignment.delete).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers before reading assignment data", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "权限不足" }), { status: 403 }) as never,
    });
    const response = await DELETE(request() as never, context);
    expect(response.status).toBe(403);
    expect(prisma.learningAssignment.findUnique).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/learning/assignments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireApiUser).mockResolvedValue({
      user: { id: 1, username: "admin", role: "admin" },
      response: null,
    });
    vi.mocked(validateLearningAssignmentProblemItems).mockReturnValue({
      data: [{ assignmentProblemId: 31 }, { problemId: 52 }],
      error: null,
    });
    vi.mocked(replaceLearningAssignmentProblems).mockResolvedValue({
      addedProblemCount: 1,
      removedProblemCount: 1,
      unlinkedSubmissionCount: 2,
    });
  });

  it("updates metadata and the ordered problem draft in one transaction", async () => {
    const tx = createTx();
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (callback) => callback(tx as never),
    );

    const response = await PATCH(
      patchRequest({
        note: "继续训练",
        problemItems: [
          { assignmentProblemId: 31 },
          { problemId: 52 },
        ],
        title: "循环专项",
      }) as never,
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(replaceLearningAssignmentProblems).toHaveBeenCalledWith({
      assignmentId: 12,
      db: tx,
      items: [{ assignmentProblemId: 31 }, { problemId: 52 }],
      studentId: 7,
    });
    expect(tx.learningAssignment.update).toHaveBeenCalledWith({
      data: { note: "继续训练", title: "循环专项" },
      where: { id: 12 },
    });
    expect(body).toMatchObject({
      addedProblemCount: 1,
      removedProblemCount: 1,
      unlinkedSubmissionCount: 2,
    });
  });

  it("rejects problem changes to an archived assignment", async () => {
    const tx = createTx();
    tx.learningAssignment.findUnique.mockResolvedValueOnce({
      createdById: 1,
      id: 12,
      status: "archived",
      studentId: 7,
    });
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (callback) => callback(tx as never),
    );

    const response = await PATCH(
      patchRequest({
        problemItems: [{ assignmentProblemId: 31 }],
      }) as never,
      context,
    );

    expect(response.status).toBe(409);
    expect(replaceLearningAssignmentProblems).not.toHaveBeenCalled();
  });

  it("hides another teacher's assignment behind a 404", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: { id: 7, username: "coach", role: "teacher" },
      response: null,
    });
    const tx = createTx();
    tx.learningAssignment.findUnique.mockResolvedValueOnce({
      createdById: 8,
      id: 12,
      status: "active",
      studentId: 9,
    });
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (callback) => callback(tx as never),
    );

    const response = await PATCH(
      patchRequest({ title: "不能修改" }) as never,
      context,
    );

    expect(response.status).toBe(404);
    expect(tx.learningAssignment.update).not.toHaveBeenCalled();
  });
});
