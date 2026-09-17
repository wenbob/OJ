export class FeedbackError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) {
    super(message);
    this.name = "FeedbackError";
  }
}

export function feedbackId(value: string) {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
    throw new FeedbackError("反馈不存在", 404);
  }
  return id;
}

export function feedbackText(value: unknown, max: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new FeedbackError(`${label}须为 1–${max} 字`);
  }
  return value.trim();
}
