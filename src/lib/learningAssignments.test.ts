import { describe, expect, it } from "vitest";
import {
  createBulkLearningAssignments,
  createLearningAssignment,
  getAssignmentProgress,
  replaceLearningAssignmentProblems,
  validateBulkLearningAssignmentDraft,
  validateLearningAssignmentDraft,
  validateLearningAssignmentProblemItems,
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

describe("bulk learning assignment validation", () => {
  it("accepts independent ordered problem lists for multiple students", () => {
    const result = validateBulkLearningAssignmentDraft({
      assignments: [
        { problemIds: [10, 11], studentId: 3 },
        { problemIds: [10, 12], studentId: 4 },
      ],
      dueAt: "2026-08-08T12:00:00.000Z",
      note: "请按顺序完成",
      title: "课后练习",
    });

    expect(result.error).toBeNull();
    expect(result.data?.assignments).toEqual([
      { problemIds: [10, 11], studentId: 3 },
      { problemIds: [10, 12], studentId: 4 },
    ]);
  });

  it("rejects duplicate students, duplicate problems and more than 100 students", () => {
    expect(
      validateBulkLearningAssignmentDraft({
        assignments: [
          { problemIds: [1], studentId: 3 },
          { problemIds: [2], studentId: 3 },
        ],
        title: "课后练习",
      }).error,
    ).toContain("重复布置");
    expect(
      validateBulkLearningAssignmentDraft({
        assignments: [{ problemIds: [1, 1], studentId: 3 }],
        title: "课后练习",
      }).error,
    ).toContain("重复添加");
    expect(
      validateBulkLearningAssignmentDraft({
        assignments: Array.from({ length: 101 }, (_, index) => ({
          problemIds: [1],
          studentId: index + 1,
        })),
        title: "课后练习",
      }).error,
    ).toContain("100");
  });
});

describe("learning assignment published problem validation", () => {
  it("accepts a mixed ordered list of existing and new problems", () => {
    expect(
      validateLearningAssignmentProblemItems([
        { assignmentProblemId: 8 },
        { problemId: 21 },
      ]),
    ).toEqual({
      data: [{ assignmentProblemId: 8 }, { problemId: 21 }],
      error: null,
    });
  });

  it("rejects empty, duplicate and ambiguous problem items", () => {
    expect(validateLearningAssignmentProblemItems([]).error).toContain(
      "1 至 10",
    );
    expect(
      validateLearningAssignmentProblemItems([
        { assignmentProblemId: 8 },
        { assignmentProblemId: 8 },
      ]).error,
    ).toContain("重复");
    expect(
      validateLearningAssignmentProblemItems([
        { assignmentProblemId: 8, problemId: 21 },
      ]).error,
    ).toContain("只能指定");
  });
});

describe("learning assignment published problem replacement", () => {
  function replacementDatabase({
    conflicts = [] as Array<{ problemId: number; problemTitle: string }>,
  } = {}) {
    return {
      learningAssignmentProblem: {
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              assignmentId: 5,
              completedAt: new Date("2026-07-20T00:00:00.000Z"),
              id: 11,
              order: 0,
              problemCategory: "循环",
              problemDifficulty: "入门",
              problemId: 1,
              problemTitle: "保留题",
            },
            {
              assignmentId: 5,
              completedAt: null,
              id: 12,
              order: 1,
              problemCategory: "数组",
              problemDifficulty: "入门",
              problemId: 2,
              problemTitle: "移除题",
            },
          ])
          .mockResolvedValueOnce(conflicts),
        update: vi.fn().mockResolvedValue({}),
      },
      problem: {
        findMany: vi.fn().mockResolvedValue([
          {
            category: "字符串",
            difficulty: "普及-",
            id: 3,
            problemType: "programming",
            title: "新增题",
          },
        ]),
      },
      submission: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
  }

  it("preserves kept progress, unlinks removed submissions and writes the new order", async () => {
    const db = replacementDatabase();

    const result = await replaceLearningAssignmentProblems({
      assignmentId: 5,
      db: db as never,
      items: [{ assignmentProblemId: 11 }, { problemId: 3 }],
      studentId: 9,
    });

    expect(db.submission.updateMany).toHaveBeenCalledWith({
      data: { learningAssignmentId: null },
      where: {
        learningAssignmentId: 5,
        problemId: { in: [2] },
      },
    });
    expect(db.learningAssignmentProblem.deleteMany).toHaveBeenCalledWith({
      where: { assignmentId: 5, id: { in: [12] } },
    });
    expect(db.learningAssignmentProblem.update).toHaveBeenCalledWith({
      data: { order: 0 },
      where: { id: 11 },
    });
    expect(db.learningAssignmentProblem.create).toHaveBeenCalledWith({
      data: {
        assignmentId: 5,
        order: 1,
        problemCategory: "字符串",
        problemDifficulty: "普及-",
        problemId: 3,
        problemTitle: "新增题",
      },
    });
    expect(result).toEqual({
      addedProblemCount: 1,
      removedProblemCount: 1,
      unlinkedSubmissionCount: 2,
    });
  });

  it("rejects new problems that conflict with another active task", async () => {
    const db = replacementDatabase({
      conflicts: [{ problemId: 3, problemTitle: "新增题" }],
    });

    await expect(
      replaceLearningAssignmentProblems({
        assignmentId: 5,
        db: db as never,
        items: [{ assignmentProblemId: 11 }, { problemId: 3 }],
        studentId: 9,
      }),
    ).rejects.toThrow("其他未完成任务");
    expect(db.submission.updateMany).not.toHaveBeenCalled();
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

describe("bulk learning assignment database safeguards", () => {
  function bulkDatabase({
    archivedProblemId = null as number | null,
    conflicts = [] as Array<{
      assignment: { studentId: number };
      problemId: number;
      problemTitle: string;
    }>,
    problemType = "programming",
    students = [
      { id: 2, username: "student02" },
      { id: 3, username: "student03" },
    ],
  } = {}) {
    let nextId = 30;
    return {
      learningAssignment: {
        create: vi.fn(async () => ({ id: nextId++ })),
      },
      learningAssignmentProblem: {
        findMany: vi.fn(async () => conflicts),
      },
      problem: {
        findMany: vi.fn(async () => [
          {
            archivedAt: archivedProblemId === 10 ? new Date() : null,
            category: "循环",
            difficulty: "入门",
            id: 10,
            problemType,
            title: "公共题",
          },
          {
            archivedAt: archivedProblemId === 11 ? new Date() : null,
            category: "数组",
            difficulty: "普及-",
            id: 11,
            problemType,
            title: "个性题",
          },
        ]),
      },
      user: {
        findMany: vi.fn(async () => students),
      },
    };
  }

  const draft = {
    assignments: [
      { problemIds: [10], studentId: 2 },
      { problemIds: [10, 11], studentId: 3 },
    ],
    dueAt: null,
    note: "请按顺序完成",
    title: "课后练习",
  };

  it("writes one independent assignment per student with immutable snapshots", async () => {
    const db = bulkDatabase();
    const result = await createBulkLearningAssignments({
      createdById: 9,
      db: db as never,
      draft,
    });

    expect(result).toEqual([
      { id: 30, problemCount: 1, studentId: 2, username: "student02" },
      { id: 31, problemCount: 2, studentId: 3, username: "student03" },
    ]);
    expect(db.learningAssignment.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 9,
          problems: {
            create: [
              expect.objectContaining({ order: 0, problemId: 10 }),
              expect.objectContaining({ order: 1, problemId: 11 }),
            ],
          },
          studentId: 3,
        }),
      }),
    );
  });

  it("reports every affected student and performs zero writes on conflict", async () => {
    const db = bulkDatabase({
      conflicts: [
        {
          assignment: { studentId: 3 },
          problemId: 11,
          problemTitle: "个性题",
        },
      ],
    });

    await expect(
      createBulkLearningAssignments({
        createdById: 9,
        db: db as never,
        draft,
      }),
    ).rejects.toMatchObject({
      conflicts: [
        {
          problems: [{ problemId: 11, title: "个性题" }],
          studentId: 3,
          username: "student03",
        },
      ],
    });
    expect(db.learningAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects missing students and objective problems before writing", async () => {
    const missingStudentDb = bulkDatabase({
      students: [{ id: 2, username: "student02" }],
    });
    await expect(
      createBulkLearningAssignments({
        createdById: 9,
        db: missingStudentDb as never,
        draft,
      }),
    ).rejects.toThrow("不存在");
    expect(missingStudentDb.learningAssignment.create).not.toHaveBeenCalled();

    const objectiveDb = bulkDatabase({ problemType: "objective" });
    await expect(
      createBulkLearningAssignments({
        createdById: 9,
        db: objectiveDb as never,
        draft,
      }),
    ).rejects.toThrow("编程题");
    expect(objectiveDb.learningAssignment.create).not.toHaveBeenCalled();
  });

  it("identifies a problem archived after it was selected", async () => {
    const db = bulkDatabase({ archivedProblemId: 11 });

    await expect(
      createBulkLearningAssignments({
        createdById: 9,
        db: db as never,
        draft,
      }),
    ).rejects.toMatchObject({
      invalidProblems: [
        { problemId: 11, reason: "archived", title: "个性题" },
      ],
    });
    expect(db.learningAssignment.create).not.toHaveBeenCalled();
  });
});
