import { beforeEach, describe, expect, it } from "vitest";
import {
  clearObjectiveSubmissionReservations,
  reserveObjectiveSubmission,
} from "./objectiveSubmissionRateLimit";

describe("objective submission reservation", () => {
  beforeEach(() => clearObjectiveSubmissionReservations());

  it("allows only one in-flight write for the same user, problem and scope", () => {
    const scope = {
      examId: null,
      problemId: 12,
      submissionType: "practice",
      userId: 7,
    };
    const first = reserveObjectiveSubmission(scope);
    const overlapping = reserveObjectiveSubmission(scope);

    expect(first.allowed).toBe(true);
    expect(overlapping.allowed).toBe(false);

    first.release();
    expect(reserveObjectiveSubmission(scope).allowed).toBe(true);
  });

  it("isolates reservations by exam scope", () => {
    const daily = reserveObjectiveSubmission({
      examId: null,
      problemId: 12,
      submissionType: "practice",
      userId: 7,
    });
    const exam = reserveObjectiveSubmission({
      examId: 3,
      problemId: 12,
      submissionType: "exam",
      userId: 7,
    });

    expect(daily.allowed).toBe(true);
    expect(exam.allowed).toBe(true);
  });
});
