import { describe, expect, it } from "vitest";
import {
  buildStudentLearningReview,
  type LearningReviewProblemInput,
  type LearningReviewSubmissionInput,
} from "./learningReview";

const problems: LearningReviewProblemInput[] = [
  {
    category: "循环",
    difficulty: "入门",
    id: 1,
    problemType: "programming",
    title: "求和",
  },
  {
    category: "循环",
    difficulty: "普及",
    id: 2,
    problemType: "programming",
    title: "质数",
  },
  {
    category: "字符串",
    difficulty: "入门",
    id: 3,
    problemType: "objective",
    title: "字符判断",
  },
];

function submission(
  id: number,
  problemId: number,
  status: string,
  submissionType = "practice",
): LearningReviewSubmissionInput {
  return {
    createdAt: new Date(`2026-07-${String(id).padStart(2, "0")}T08:00:00Z`),
    id,
    problemId,
    status,
    submissionType,
  };
}

describe("student learning review", () => {
  it("keeps pending mistakes and excludes first-try Accepted problems", () => {
    const review = buildStudentLearningReview({
      problems,
      submissions: [
        submission(1, 1, "Accepted"),
        submission(2, 2, "Compile Error"),
        submission(3, 2, "Wrong Answer"),
      ],
    });

    expect(review.entries).toHaveLength(1);
    expect(review.entries[0]).toMatchObject({
      attemptCount: 2,
      failedAttemptCount: 2,
      problemId: 2,
      resumeSubmissionId: 3,
      status: "pending",
    });
    expect(review.summary).toMatchObject({
      acceptedProblemCount: 1,
      attemptedProblemCount: 2,
      mistakeProblemCount: 1,
      pendingProblemCount: 1,
    });
  });

  it("marks a failed-then-Accepted problem as conquered", () => {
    const review = buildStudentLearningReview({
      problems,
      submissions: [
        submission(1, 1, "Wrong Answer"),
        submission(2, 1, "Accepted"),
      ],
    });

    expect(review.entries[0]).toMatchObject({
      firstAcceptedAt: new Date("2026-07-02T08:00:00Z"),
      latestStatus: "Accepted",
      status: "conquered",
    });
    expect(review.summary.conqueredProblemCount).toBe(1);
  });

  it("combines exam and practice attempts but only resumes a practice submission", () => {
    const review = buildStudentLearningReview({
      problems,
      submissions: [
        submission(1, 3, "Wrong Answer", "practice"),
        submission(2, 3, "Wrong Answer", "exam"),
      ],
    });

    expect(review.entries[0]).toMatchObject({
      latestSubmissionId: 2,
      latestSubmissionType: "exam",
      resumeSubmissionId: 1,
    });
  });

  it("does not try to load exam code into daily practice when no practice attempt exists", () => {
    const review = buildStudentLearningReview({
      problems,
      submissions: [submission(1, 3, "Wrong Answer", "exam")],
    });

    expect(review.entries[0].resumeSubmissionId).toBeNull();
  });

  it("builds and orders weak categories from unique attempted problems", () => {
    const review = buildStudentLearningReview({
      problems,
      submissions: [
        submission(1, 1, "Wrong Answer"),
        submission(2, 1, "Accepted"),
        submission(3, 2, "Wrong Answer"),
        submission(4, 3, "Wrong Answer"),
        submission(5, 3, "Accepted"),
      ],
    });

    expect(review.weakCategories).toEqual([
      {
        acceptedProblemCount: 1,
        attemptedProblemCount: 2,
        category: "循环",
        failedAttemptCount: 2,
        masteryPercent: 50,
        mistakeProblemCount: 2,
        pendingProblemCount: 1,
      },
      {
        acceptedProblemCount: 1,
        attemptedProblemCount: 1,
        category: "字符串",
        failedAttemptCount: 1,
        masteryPercent: 100,
        mistakeProblemCount: 1,
        pendingProblemCount: 0,
      },
    ]);
  });
});
