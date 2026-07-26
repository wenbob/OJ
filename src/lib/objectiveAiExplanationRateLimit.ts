import { reserveAiProviderRequest } from "@/lib/aiAssistRateLimit";

export const OBJECTIVE_EXPLANATION_COOLDOWN_MS = 30_000;

const cooldowns = new Map<number, number>();

export function reserveObjectiveAiExplanation({
  itemIndex,
  now = Date.now(),
  problemId,
  staffId,
}: {
  itemIndex: number;
  now?: number;
  problemId: number;
  staffId: number;
}) {
  const lastUsedAt = cooldowns.get(staffId);
  if (
    lastUsedAt !== undefined &&
    now - lastUsedAt < OBJECTIVE_EXPLANATION_COOLDOWN_MS
  ) {
    return {
      allowed: false as const,
      reason: "cooldown" as const,
      retryAfterSeconds: Math.ceil(
        (OBJECTIVE_EXPLANATION_COOLDOWN_MS - (now - lastUsedAt)) / 1000,
      ),
    };
  }

  const providerReservation = reserveAiProviderRequest({
    requestKey: `objective:${problemId}:${itemIndex}`,
  });
  if (!providerReservation.allowed) {
    return {
      allowed: false as const,
      reason: "busy" as const,
      retryAfterSeconds: providerReservation.retryAfterSeconds,
    };
  }

  cooldowns.set(staffId, now);
  return {
    allowed: true as const,
    release: providerReservation.release,
  };
}

export function clearObjectiveAiExplanationRateLimits() {
  cooldowns.clear();
}
