import { reserveAiProviderRequest } from "./aiAssistRateLimit";

const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 30_000;

function key(adminId: number, studentId: number) {
  return `${adminId}:${studentId}`;
}

export function reserveTeacherInsight({
  adminId,
  force,
  now = Date.now(),
  studentId,
}: {
  adminId: number;
  force: boolean;
  now?: number;
  studentId: number;
}) {
  const requestKey = key(adminId, studentId);
  const last = cooldowns.get(requestKey);
  if (force && last !== undefined && now - last < COOLDOWN_MS) {
    return {
      allowed: false as const,
      reason: "cooldown" as const,
      retryAfterSeconds: Math.ceil((COOLDOWN_MS - (now - last)) / 1000),
    };
  }
  const providerReservation = reserveAiProviderRequest({
    requestKey: `teacher:${requestKey}`,
  });
  if (!providerReservation.allowed) {
    return {
      allowed: false as const,
      reason: "busy" as const,
      retryAfterSeconds: 10,
    };
  }
  cooldowns.set(requestKey, now);
  return {
    allowed: true as const,
    release: providerReservation.release,
  };
}

export function clearTeacherInsightRateLimits() {
  cooldowns.clear();
}
