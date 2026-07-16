import { describe, expect, it } from "vitest";
import { isSameExamTakeUrl } from "./ExamExitGuard";

describe("exam exit URL classification", () => {
  const base = "http://oj.local/student/exams/8/take?problemId=12";

  it("allows switching questions inside the same exam", () => {
    expect(
      isSameExamTakeUrl("/student/exams/8/take?problemId=13", 8, base),
    ).toBe(true);
  });

  it("treats other site routes and other exams as exits", () => {
    expect(isSameExamTakeUrl("/student/problems", 8, base)).toBe(false);
    expect(isSameExamTakeUrl("/student/exams/9/take", 8, base)).toBe(false);
  });

  it("does not allow an external site that copies the same path", () => {
    expect(
      isSameExamTakeUrl("https://example.com/student/exams/8/take", 8, base),
    ).toBe(false);
  });
});
