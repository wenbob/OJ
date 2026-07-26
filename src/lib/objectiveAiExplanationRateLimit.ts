import {
  clearAiAssistCooldowns,
  reserveAiProviderRequest,
} from "@/lib/aiAssistRateLimit";

export function reserveObjectiveAiExplanation({
  cooldownSeconds,
  itemIndex,
  now,
  problemId,
  staffId,
}: {
  cooldownSeconds: number;
  itemIndex: number;
  now?: number;
  problemId: number;
  staffId: number;
}) {
  return reserveAiProviderRequest({
    accountId: staffId,
    cooldownSeconds,
    now,
    profile: "objective",
    requestKey: `objective:${problemId}:${itemIndex}`,
  });
}

export function clearObjectiveAiExplanationRateLimits() {
  clearAiAssistCooldowns();
}
