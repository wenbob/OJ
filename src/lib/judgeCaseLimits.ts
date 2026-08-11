export const MAX_JUDGE_CASES = 100;
export const MAX_JUDGE_CASE_BYTES = 256 * 1024;
export const MAX_JUDGE_TOTAL_CASE_BYTES = 2 * 1024 * 1024;

type JudgeCasePayload = { input: string; output?: string };

export function getJudgeCasePayloadError(cases: JudgeCasePayload[]) {
  if (cases.length > MAX_JUDGE_CASES) {
    return `测试点不能超过 ${MAX_JUDGE_CASES} 组`;
  }
  let totalBytes = 0;
  for (const [index, testCase] of cases.entries()) {
    const caseBytes =
      Buffer.byteLength(testCase.input, "utf8") +
      Buffer.byteLength(testCase.output ?? "", "utf8");
    if (caseBytes > MAX_JUDGE_CASE_BYTES) {
      return `第 ${index + 1} 组测试点输入与输出合计不能超过 ${Math.floor(MAX_JUDGE_CASE_BYTES / 1024)}KB`;
    }
    totalBytes += caseBytes;
    if (totalBytes > MAX_JUDGE_TOTAL_CASE_BYTES) {
      return `全部测试点输入与输出合计不能超过 ${Math.floor(MAX_JUDGE_TOTAL_CASE_BYTES / 1024 / 1024)}MB`;
    }
  }
  return "";
}

export function assertJudgeCasePayload(cases: JudgeCasePayload[]) {
  const error = getJudgeCasePayloadError(cases);
  if (error) throw new Error(error);
}
