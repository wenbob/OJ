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

  it("hides programming test input and expected output from students", () => {
    const submission = {
      id: 2,
      language: "C++17",
      caseResults: [
        {
          id: 20,
          caseIndex: 1,
          input: "21 21",
          expectedOutput: "42",
          actualOutput: "41",
        },
      ],
    };

    expect(sanitizeSubmissionForStudent(submission)).toEqual({
      id: 2,
      language: "C++17",
      caseResults: [
        {
          id: 20,
          caseIndex: 1,
          input: "",
          expectedOutput: "",
          actualOutput: "41",
          studentDetailsHidden: true,
        },
      ],
    });
  });
});
