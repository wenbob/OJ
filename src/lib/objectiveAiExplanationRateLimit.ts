import {
  clearAiAssistCooldowns,
  reserveAiProviderRequest,
} from "@/lib/aiAssistRateLimit";

export function reserveObjectiveAiExplanation({
  accountId,
  cooldownSeconds,
  itemIndex,
  now,
  problemId,
}: {
  accountId: number;
  cooldownSeconds: number;
  itemIndex: number;
  now?: number;
  problemId: number;
}) {
  return reserveAiProviderRequest({
    accountId,
    cooldownSeconds,
    now,
    profile: "objective",
    requestKey: `objective:${problemId}:${itemIndex}`,
  });
}

export function clearObjectiveAiExplanationRateLimits() {
  clearAiAssistCooldowns();
}
