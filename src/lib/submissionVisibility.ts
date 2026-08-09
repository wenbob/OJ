type SubmissionWithCaseResults = {
  language?: string;
  caseResults?: Array<{
    input?: string | null;
    expectedOutput?: string | null;
    studentDetailsHidden?: boolean;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export function sanitizeSubmissionForStudent<T extends SubmissionWithCaseResults>(
  submission: T,
): T {
  return {
    ...submission,
    caseResults: submission.caseResults?.map((caseResult) => ({
      ...caseResult,
      ...(submission.language === "Objective"
        ? {}
        : {
            input: "",
            studentDetailsHidden: true,
          }),
      expectedOutput: "",
    })),
  };
}
