export type CppProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  runtimeMs: number;
  errorMessage?: string;
};

export type RunCppInput = {
  code: string;
  inputs: string[];
  expectedOutputs?: string[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
};

export type RunCppCaseStatus =
  | "matched"
  | "mismatched"
  | "completed"
  | "runtime_error"
  | "time_limit_exceeded";

export type RunCppStatus =
  | "sample_passed"
  | "sample_failed"
  | "completed"
  | "compile_error"
  | "runtime_error"
  | "time_limit_exceeded";

export type RunCppCaseResult = {
  caseIndex: number;
  status: RunCppCaseStatus;
  input: string;
  expectedOutput?: string;
  actualOutput: string;
  runtimeMs: number;
  errorMessage?: string;
};

export type RunCppResult = {
  status: RunCppStatus;
  runtimeMs: number;
  errorMessage?: string;
  cases: RunCppCaseResult[];
};

export function normalizeCppOutput(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trimEnd();
}

export function truncateCppOutput(value: string, maxLength = 5000) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...（内容过长，已截断）`;
}

export function buildRunCaseResult({
  caseIndex,
  expectedOutput,
  input,
  processResult,
  runtimeErrorFallback = "程序运行时异常",
  timeLimitMs,
}: {
  caseIndex: number;
  expectedOutput?: string;
  input: string;
  processResult: CppProcessResult;
  runtimeErrorFallback?: string;
  timeLimitMs: number;
}): RunCppCaseResult {
  const actualOutput = truncateCppOutput(processResult.stdout);
  const displayedExpectedOutput =
    expectedOutput === undefined
      ? undefined
      : truncateCppOutput(expectedOutput);

  if (processResult.timedOut) {
    return {
      actualOutput,
      caseIndex,
      errorMessage: `运行超过 ${timeLimitMs}ms`,
      expectedOutput: displayedExpectedOutput,
      input: truncateCppOutput(input),
      runtimeMs: processResult.runtimeMs,
      status: "time_limit_exceeded",
    };
  }

  if (processResult.errorMessage || processResult.exitCode !== 0) {
    return {
      actualOutput,
      caseIndex,
      errorMessage: truncateCppOutput(
        processResult.errorMessage ||
          processResult.stderr ||
          runtimeErrorFallback,
      ),
      expectedOutput: displayedExpectedOutput,
      input: truncateCppOutput(input),
      runtimeMs: processResult.runtimeMs,
      status: "runtime_error",
    };
  }

  if (
    expectedOutput !== undefined &&
    normalizeCppOutput(processResult.stdout) !== normalizeCppOutput(expectedOutput)
  ) {
    return {
      actualOutput,
      caseIndex,
      errorMessage: "程序输出与标准输出不一致",
      expectedOutput: displayedExpectedOutput,
      input: truncateCppOutput(input),
      runtimeMs: processResult.runtimeMs,
      status: "mismatched",
    };
  }

  return {
    actualOutput,
    caseIndex,
    expectedOutput: displayedExpectedOutput,
    input: truncateCppOutput(input),
    runtimeMs: processResult.runtimeMs,
    status: expectedOutput === undefined ? "completed" : "matched",
  };
}

export function summarizeRunCases({
  cases,
  compared,
}: {
  cases: RunCppCaseResult[];
  compared: boolean;
}): RunCppResult {
  const firstFailure = cases.find(
    (item) => item.status !== "matched" && item.status !== "completed",
  );
  let status: RunCppStatus = compared ? "sample_passed" : "completed";

  if (firstFailure?.status === "time_limit_exceeded") {
    status = "time_limit_exceeded";
  } else if (firstFailure?.status === "runtime_error") {
    status = "runtime_error";
  } else if (firstFailure?.status === "mismatched") {
    status = "sample_failed";
  }

  return {
    cases,
    errorMessage: firstFailure?.errorMessage,
    runtimeMs: cases.reduce((total, item) => total + item.runtimeMs, 0),
    status,
  };
}

export function compileErrorRunResult({
  errorMessage,
  runtimeMs,
}: {
  errorMessage: string;
  runtimeMs: number;
}): RunCppResult {
  return {
    cases: [],
    errorMessage: truncateCppOutput(errorMessage),
    runtimeMs,
    status: "compile_error",
  };
}
