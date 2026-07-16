import { describe, expect, it } from "vitest";
import {
  buildTeacherInsightPrompt,
  hashTeacherInsightInput,
  type TeacherInsightInput,
} from "./teacherLearningInsight";

const input: TeacherInsightInput = {
  username: "student1",
  window: "30d",
  issueLabels: ["逻辑判断需加强"],
  statusCounts: { "Wrong Answer": 4 },
  stuckProblems: [{ title: "最大值", category: "循环", failedCount: 3 }],
  categories: [
    {
      category: "循环",
      acceptedProblemCount: 1,
      attemptedProblemCount: 3,
      masteryPercent: 33,
      pendingProblemCount: 2,
      windowFailedCount: 5,
    },
  ],
  summary: {
    acceptedProblemCount: 1,
    attemptedProblemCount: 3,
    failedSubmissionCount: 5,
    lastTrainingAt: new Date("2026-07-15T08:00:00Z"),
    pendingProblemCount: 2,
    submissionCount: 6,
    uniqueAcceptedInWindow: 1,
  },
};

describe("teacher learning insight", () => {
  it("only puts aggregate learning data in the prompt", () => {
    const prompt = buildTeacherInsightPrompt(input);
    expect(prompt).toContain("逻辑判断需加强");
    expect(prompt).toContain("必须严格包含四个标题");
    expect(prompt).not.toContain("#include");
    expect(prompt).not.toContain("隐藏测试点内容");
    expect(prompt).not.toContain("int main");
  });

  it("reuses a stable hash for identical aggregate input", () => {
    expect(hashTeacherInsightInput(input)).toBe(
      hashTeacherInsightInput({ ...input, issueLabels: [...input.issueLabels] }),
    );
    expect(hashTeacherInsightInput(input)).not.toBe(
      hashTeacherInsightInput({ ...input, statusCounts: {} }),
    );
  });
});
