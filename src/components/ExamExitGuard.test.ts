import { describe, expect, it } from "vitest";
import {
  consumeReloadOfCurrentExam,
  createExamHistoryGuardState,
  getExamHistoryGuardMarker,
  isMatchingExamHistorySentinel,
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

  it("preserves Next.js history internals while adding guard metadata", () => {
    const tree = { segment: "student-exam" };
    const originalState = {
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: tree,
      customValue: "kept",
    };
    const guardedState = createExamHistoryGuardState({
      examId: 8,
      phase: "base",
      state: originalState,
      token: "guard-token",
      url: base,
    });

    expect(guardedState).not.toBe(originalState);
    expect(guardedState.__NA).toBe(true);
    expect(guardedState.__PRIVATE_NEXTJS_INTERNALS_TREE).toBe(tree);
    expect(guardedState.customValue).toBe("kept");
    expect(getExamHistoryGuardMarker(guardedState)).toEqual({
      examId: 8,
      phase: "base",
      token: "guard-token",
      url: base,
    });
    expect(getExamHistoryGuardMarker(originalState)).toBeNull();
  });

  it("creates a valid sentinel even when the original state is empty", () => {
    const guardedState = createExamHistoryGuardState({
      examId: 8,
      phase: "sentinel",
      state: null,
      token: "guard-token",
      url: base,
    });

    expect(
      isMatchingExamHistorySentinel({
        examId: 8,
        state: guardedState,
        token: "guard-token",
        url: base,
      }),
    ).toBe(true);
  });

  it("does not reuse a sentinel from another exam, URL, or component", () => {
    const guardedState = createExamHistoryGuardState({
      examId: 8,
      phase: "sentinel",
      state: { __NA: true },
      token: "guard-token",
      url: base,
    });

    expect(
      isMatchingExamHistorySentinel({
        examId: 9,
        state: guardedState,
        token: "guard-token",
        url: base,
      }),
    ).toBe(false);
    expect(
      isMatchingExamHistorySentinel({
        examId: 8,
        state: guardedState,
        token: "other-token",
        url: base,
      }),
    ).toBe(false);
    expect(
      isMatchingExamHistorySentinel({
        examId: 8,
        state: guardedState,
        token: "guard-token",
        url: `${base}&other=1`,
      }),
    ).toBe(false);
  });

  it("rejects malformed history markers", () => {
    expect(getExamHistoryGuardMarker(null)).toBeNull();
    expect(getExamHistoryGuardMarker([])).toBeNull();
    expect(
      getExamHistoryGuardMarker({
        __ojExamGuard: {
          examId: "8",
          phase: "sentinel",
          token: "guard-token",
          url: base,
        },
      }),
    ).toBeNull();
    expect(
      getExamHistoryGuardMarker({
        __ojExamGuard: {
          examId: 8,
          phase: "unknown",
          token: "guard-token",
          url: base,
        },
      }),
    ).toBeNull();
  });
});
