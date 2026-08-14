import { describe, expect, it } from "vitest";
import {
  consumeReloadOfCurrentExam,
  isSameExamTakeUrl,
} from "./ExamExitGuard";

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

  it("does not mistake a reloaded login document for an exam reload", () => {
    expect(
      consumeReloadOfCurrentExam({
        consumedEntries: new Set(),
        currentUrl: base,
        examId: 8,
        navigation: {
          name: "http://oj.local/login",
          startTime: 0,
          type: "reload",
        },
      }),
    ).toBe(false);
  });

  it("consumes a real exam reload only once in the same document", () => {
    const consumedEntries = new Set<string>();
    const navigation = {
      name: "http://oj.local/student/exams/8/take?problemId=12",
      startTime: 0,
      type: "reload" as const,
    };

    expect(
      consumeReloadOfCurrentExam({
        consumedEntries,
        currentUrl: base,
        examId: 8,
        navigation,
      }),
    ).toBe(true);
    expect(
      consumeReloadOfCurrentExam({
        consumedEntries,
        currentUrl: base,
        examId: 8,
        navigation,
      }),
    ).toBe(false);
  });

  it("does not submit a direct navigation to the exam", () => {
    expect(
      consumeReloadOfCurrentExam({
        consumedEntries: new Set(),
        currentUrl: base,
        examId: 8,
        navigation: {
          name: base,
          startTime: 0,
          type: "navigate",
        },
      }),
    ).toBe(false);
  });
});
