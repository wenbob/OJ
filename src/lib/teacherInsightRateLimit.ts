import {
  clearAiAssistCooldowns,
  reserveAiProviderRequest,
} from "./aiAssistRateLimit";

export function reserveTeacherInsight({
  adminId,
  cooldownSeconds,
  now,
  studentId,
  window,
}: {
  adminId: number;
  cooldownSeconds: number;
  now?: number;
  studentId: number;
  window: string;
}) {
  return reserveAiProviderRequest({
    accountId: adminId,
    cooldownSeconds,
    now,
    profile: "programming",
    requestKey: `teacher-insight:${studentId}:${window}`,
  });
}

export function clearTeacherInsightRateLimits() {
  clearAiAssistCooldowns();
}
