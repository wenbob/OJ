// Browser-safe limits; the server enforces these independently.
export const FEEDBACK_LIMITS = {
  title: 100,
  content: 5000,
  reply: 3000,
  attachments: 3,
  fileBytes: 5 * 1024 * 1024,
  requestBytes: 16 * 1024 * 1024,
  storedImageBytes: 1024 * 1024,
  imagePixels: 16_000_000,
  pageSize: 20,
  cooldownMs: 30_000,
} as const;

export const FEEDBACK_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export type FeedbackStatus = "pending" | "resolved";
export const feedbackStatusLabel = (status: string) => status === "resolved" ? "已处理" : "待处理";
