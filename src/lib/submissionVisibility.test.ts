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

  it("keeps programming expected output visible for normal judge feedback", () => {
    const submission = {
      id: 2,
      language: "C++17",
      caseResults: [
        {
          id: 20,
          caseIndex: 1,
          expectedOutput: "42",
          actualOutput: "41",
        },
      ],
    };

    expect(sanitizeSubmissionForStudent(submission)).toEqual(submission);
  });
});
