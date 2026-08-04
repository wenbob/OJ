import { describe, expect, it } from "vitest";
import { getStudentObjectiveAiDisplayState } from "@/lib/studentObjectiveAi";

describe("getStudentObjectiveAiDisplayState", () => {
  it("keeps the explanation panel hidden before the first practice submission", () => {
    expect(
      getStudentObjectiveAiDisplayState({
        enabled: true,
        hasPriorPracticeSubmission: false,
      }),
    ).toEqual({
      showActions: true,
      showPanel: false,
    });
  });

  it("shows the explanation panel after a practice submission", () => {
    expect(
      getStudentObjectiveAiDisplayState({
        enabled: true,
        hasPriorPracticeSubmission: true,
      }),
    ).toEqual({
      showActions: true,
      showPanel: true,
    });
  });

  it("keeps all student objective AI entry points hidden when disabled", () => {
    expect(
      getStudentObjectiveAiDisplayState({
        enabled: false,
        hasPriorPracticeSubmission: true,
      }),
    ).toEqual({
      showActions: false,
      showPanel: false,
    });
  });
});
