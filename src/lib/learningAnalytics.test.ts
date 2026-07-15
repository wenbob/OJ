import { describe, expect, it } from "vitest";
import {
  buildLearningAnalytics,
  buildLearningRecommendations,
  type LearningProblemInput,
  type LearningSubmissionInput,
} from "./learningAnalytics";

const NOW = new Date("2026-07-15T12:00:00Z");
const problems: LearningProblemInput[] = [
  { id: 1, title: "循环错题", category: "循环", difficulty: "入门", problemType: "programming" },
  { id: 2, title: "循环新题", category: "循环", difficulty: "入门", problemType: "programming" },
  { id: 3, title: "数组错题", category: "数组", difficulty: "入门", problemType: "programming" },
  { id: 4, title: "数组新题", category: "数组", difficulty: "入门", problemType: "programming" },
  { id: 5, title: "已通过题", category: "循环", difficulty: "入门", problemType: "programming" },
  { id: 6, title: "选择题", category: "循环", difficulty: "入门", problemType: "objective" },
];

function submission(
  id: number,
  problemId: number,
  status: string,
  daysAgo = 1,
  submissionType = "practice",
): LearningSubmissionInput {
  return {
    id,
    problemId,
    status,
    submissionType,
    createdAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000 + id),
  };
}

describe("teacher learning analytics", () => {
  it("uses the selected window and still keeps cumulative mastery", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [
        submission(1, 1, "Wrong Answer", 40),
        submission(2, 1, "Accepted", 35),
        submission(3, 3, "Wrong Answer", 5, "exam"),
      ],
      window: "30d",
    });

    expect(analytics.summary).toMatchObject({
      acceptedProblemCount: 1,
      attemptedProblemCount: 2,
      submissionCount: 1,
      pendingProblemCount: 1,
    });
    expect(analytics.categories.find(({ category }) => category === "循环")).toMatchObject({
      masteryPercent: 100,
      windowFailedCount: 0,
    });
  });

  it("does not treat objective submissions as programming learning data", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [submission(1, 6, "Wrong Answer")],
    });
    expect(analytics.hasLearningData).toBe(false);
    expect(analytics.issueLabels).toEqual([]);
  });

  it("detects stuck and compile thresholds", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [
        submission(1, 1, "Compile Error"),
        submission(2, 1, "Compile Error"),
        submission(3, 1, "Wrong Answer"),
        submission(4, 3, "Compile Error"),
        submission(5, 3, "Wrong Answer"),
      ],
    });
    expect(analytics.issueLabels).toEqual([
      "持续卡题",
      "编译基础不稳",
      "逻辑判断需加强",
    ]);
    expect(analytics.stuckProblems.map(({ problemId }) => problemId)).toEqual([1]);
  });

  it("detects logic and runtime thresholds independently", () => {
    const logic = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [
        submission(1, 1, "Wrong Answer"),
        submission(2, 1, "Wrong Answer"),
        submission(3, 3, "Compile Error"),
        submission(4, 3, "Accepted"),
      ],
    });
    const runtime = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [
        submission(1, 1, "Runtime Error"),
        submission(2, 1, "Time Limit Exceeded"),
        submission(3, 3, "Wrong Answer"),
        submission(4, 3, "Wrong Answer"),
        submission(5, 3, "Wrong Answer"),
        submission(6, 3, "Wrong Answer"),
      ],
    });
    expect(logic.issueLabels).toContain("逻辑判断需加强");
    expect(runtime.issueLabels).toContain("运行稳定性或效率需加强");
  });

  it("requires three failures after the latest Accepted before calling a problem stuck", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [
        submission(1, 1, "Wrong Answer"),
        submission(2, 1, "Wrong Answer"),
        submission(3, 1, "Wrong Answer"),
        submission(4, 1, "Accepted"),
        submission(5, 1, "Wrong Answer"),
      ],
    });
    expect(analytics.stuckProblems).toEqual([]);
  });

  it("marks an inactive historical student without fabricating weak data", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [submission(1, 1, "Accepted", 40)],
      window: "7d",
    });
    expect(analytics.issueLabels).toEqual(["近期未训练"]);
    expect(analytics.summary.submissionCount).toBe(0);
  });

  it("orders weak categories by pending, failures and mastery", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [
        submission(1, 1, "Wrong Answer"),
        submission(2, 3, "Wrong Answer"),
        submission(3, 3, "Wrong Answer"),
      ],
    });
    expect(analytics.categories.map(({ category }) => category)).toEqual(["数组", "循环"]);
  });
});

describe("learning recommendations", () => {
  it("round-robins pending and then unattempted programming problems", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [
        submission(1, 1, "Wrong Answer"),
        submission(2, 3, "Wrong Answer"),
      ],
    });
    const result = buildLearningRecommendations({ analytics, problems, limit: 4 });
    expect(result.problems.map(({ id, reason }) => [id, reason])).toEqual([
      [3, "pending"],
      [1, "pending"],
      [4, "unattempted"],
      [2, "unattempted"],
    ]);
  });

  it("excludes problems already used by another active assignment", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [submission(1, 1, "Wrong Answer")],
    });
    const result = buildLearningRecommendations({
      activeProblemIds: [1, 2, 5],
      analytics,
      problems,
    });
    expect(result.problems).toEqual([]);
    expect(result.shortageCategories).toEqual(["循环"]);
  });

  it("never recommends objective problems", () => {
    const analytics = buildLearningAnalytics({
      now: NOW,
      problems,
      submissions: [submission(1, 1, "Wrong Answer")],
    });
    const result = buildLearningRecommendations({ analytics, problems: [problems[0], problems[5]] });
    expect(result.problems.map(({ id }) => id)).toEqual([1]);
  });
});
