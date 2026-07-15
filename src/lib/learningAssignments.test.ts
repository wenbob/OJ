import { describe, expect, it } from "vitest";
import {
  createLearningAssignment,
  getAssignmentProgress,
  validateLearningAssignmentDraft,
} from "./learningAssignments";
import { vi } from "vitest";

describe("learning assignment validation", () => {
  it("accepts a complete 1-10 problem draft", () => {
    const result = validateLearningAssignmentDraft({
      studentId: 3,
      title: "循环专项",
      note: "先完成基础题",
      dueAt: "2026-07-20T12:00:00.000Z",
      problemIds: [1, 2, 3],
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ studentId: 3, problemIds: [1, 2, 3] });
  });

  it("rejects duplicate, empty and oversized problem lists", () => {
    expect(validateLearningAssignmentDraft({ studentId: 1, title: "练习", problemIds: [] }).error)
      .toContain("1 至 10");
    expect(validateLearningAssignmentDraft({ studentId: 1, title: "练习", problemIds: [1, 1] }).error)
      .toContain("重复");
    expect(validateLearningAssignmentDraft({ studentId: 1, title: "练习", problemIds: Array.from({ length: 11 }, (_, index) => index + 1) }).error)
      .toContain("1 至 10");
  });

  it("validates teacher-facing text and due dates", () => {
    expect(validateLearningAssignmentDraft({ studentId: 1, title: "", problemIds: [1] }).error)
      .toContain("标题");
    expect(validateLearningAssignmentDraft({ studentId: 1, title: "练习", note: "字".repeat(301), problemIds: [1] }).error)
      .toContain("300");
    expect(validateLearningAssignmentDraft({ studentId: 1, title: "练习", dueAt: "not-a-date", problemIds: [1] }).error)
      .toContain("日期");
  });
});

describe("learning assignment progress", () => {
  it("derives completion without storing a completed status", () => {
    expect(getAssignmentProgress([{ completedAt: new Date() }, { completedAt: null }]))
      .toEqual({ completed: false, completedCount: 1, percent: 50, problemCount: 2 });
    expect(getAssignmentProgress([{ completedAt: new Date() }]).completed).toBe(true);
  });
});

describe("learning assignment database safeguards", () => {
  function database({
    conflicts = [] as Array<{ problemId: number; problemTitle: string }>,
    problemType = "programming",
    role = "student",
  } = {}) {
    return {
      learningAssignment: {
        create: vi.fn(async (args) => args),
      },
      learningAssignmentProblem: {
        findMany: vi.fn(async () => conflicts),
      },
      problem: {
        findMany: vi.fn(async () => [
          { id: 1, title: "题目一", category: "循环", difficulty: "入门", problemType },
        ]),
      },
      user: {
        findUnique: vi.fn(async () => ({ id: 2, role, username: "student" })),
      },
    };
  }

  const draft = {
    dueAt: null,
    note: null,
    problemIds: [1],
    studentId: 2,
    title: "循环专项",
  };

  it("rejects non-students, objective problems and active duplicate problems", async () => {
    await expect(createLearningAssignment({ createdById: 1, draft, db: database({ role: "admin" }) as never }))
      .rejects.toThrow("学生账号");
    await expect(createLearningAssignment({ createdById: 1, draft, db: database({ problemType: "objective" }) as never }))
      .rejects.toThrow("只能包含编程题");
    await expect(createLearningAssignment({ createdById: 1, draft, db: database({ conflicts: [{ problemId: 1, problemTitle: "题目一" }] }) as never }))
      .rejects.toThrow("其他未完成任务");
  });

  it("writes immutable problem snapshots in teacher-selected order", async () => {
    const db = database();
    await createLearningAssignment({ createdById: 9, draft, db: db as never });
    expect(db.learningAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          problems: {
            create: [{
              order: 0,
              problemCategory: "循环",
              problemDifficulty: "入门",
              problemId: 1,
              problemTitle: "题目一",
            }],
          },
        }),
      }),
    );
  });
});
