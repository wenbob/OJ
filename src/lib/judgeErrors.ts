export const JUDGE_RETRY_AFTER_SECONDS = 5;

export class JudgeInfrastructureError extends Error {
  readonly internalCause: unknown;

  constructor(
    message = "评测服务暂时不可用，请稍后再试",
    internalCause?: unknown,
  ) {
    super(message);
    this.name = "JudgeInfrastructureError";
    this.internalCause = internalCause;
  }
}
