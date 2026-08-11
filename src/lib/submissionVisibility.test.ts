import { describe, expect, it } from "vitest";
import { sanitizeSubmissionForStudent } from "./submissionVisibility";

describe("sanitizeSubmissionForStudent", () => {
  it("hides objective expected answers from student-visible submissions", () => {
    const submission = {
      id: 1,
      language: "Objective",
      caseResults: [
        {
          id: 10,
          caseIndex: 1,
          expectedOutput: "B",
          actualOutput: "A",
        },
      ],
    };

    expect(sanitizeSubmissionForStudent(submission)).toEqual({
      id: 1,
      language: "Objective",
      caseResults: [
        {
          id: 10,
          caseIndex: 1,
          expectedOutput: "",
          actualOutput: "A",
        },
      ],
    });
  });

  it("hides every programming test data channel from students", () => {
    const submission = {
      errorMessage: "HIDDEN_STDERR",
      id: 2,
      language: "C++17",
      status: "Runtime Error",
      caseResults: [
        {
          errorMessage: "HIDDEN_STDERR",
          id: 20,
          caseIndex: 1,
          input: "HIDDEN_INPUT",
          expectedOutput: "42",
          actualOutput: "HIDDEN_INPUT",
          status: "Runtime Error",
        },
      ],
    };

    const sanitized = sanitizeSubmissionForStudent(submission);
    expect(sanitized).toEqual({
      errorMessage: "程序运行时异常",
      id: 2,
      language: "C++17",
      status: "Runtime Error",
      caseResults: [
        {
          errorMessage: "程序运行时异常",
          id: 20,
          caseIndex: 1,
          input: "",
          expectedOutput: "",
          actualOutput: "",
          status: "Runtime Error",
          studentDetailsHidden: true,
        },
      ],
    });
    expect(JSON.stringify(sanitized)).not.toContain("HIDDEN_INPUT");
    expect(JSON.stringify(sanitized)).not.toContain("HIDDEN_STDERR");
  });

  it("keeps compiler diagnostics because compilation never receives test data", () => {
    const submission = {
      caseResults: [],
      errorMessage: "main.cpp:3: expected ';'",
      language: "C++17",
      status: "Compile Error",
    };

    expect(sanitizeSubmissionForStudent(submission).errorMessage).toBe(
      "main.cpp:3: expected ';'",
    );
  });
});
