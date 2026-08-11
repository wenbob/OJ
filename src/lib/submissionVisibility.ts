type SubmissionWithCaseResults = {
  errorMessage?: string | null;
  language?: string;
  status?: string;
  caseResults?: Array<{
    actualOutput?: string | null;
    errorMessage?: string | null;
    input?: string | null;
    expectedOutput?: string | null;
    status?: string;
    studentDetailsHidden?: boolean;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

function studentSafeJudgeError(status?: string) {
  if (status === "Wrong Answer") return "程序输出与标准输出不一致";
  if (status === "Runtime Error") return "程序运行时异常";
  if (status === "Time Limit Exceeded") return "程序运行超时";
  return null;
}

export function sanitizeSubmissionForStudent<T extends SubmissionWithCaseResults>(
  submission: T,
): T {
  const objective = submission.language === "Objective";
  return {
    ...submission,
    ...(objective || submission.status === "Compile Error"
      ? {}
      : { errorMessage: studentSafeJudgeError(submission.status) }),
    caseResults: submission.caseResults?.map((caseResult) => ({
      ...caseResult,
      ...(objective
        ? {}
        : {
            actualOutput: "",
            errorMessage: studentSafeJudgeError(caseResult.status),
            input: "",
            studentDetailsHidden: true,
          }),
      expectedOutput: "",
    })),
  };
}
