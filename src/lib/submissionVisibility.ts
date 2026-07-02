type SubmissionWithCaseResults = {
  language?: string;
  caseResults?: Array<{
    expectedOutput?: string | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export function sanitizeSubmissionForStudent<T extends SubmissionWithCaseResults>(
  submission: T,
): T {
  if (submission.language !== "Objective") return submission;

  return {
    ...submission,
    caseResults: submission.caseResults?.map((caseResult) => ({
      ...caseResult,
      expectedOutput: "",
    })),
  };
}
