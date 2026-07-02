import type { AiAssistMode } from "@/lib/aiAssist";

export const AI_ASSIST_COOLDOWN_MS = 20_000;

type CooldownInput = {
  userId: number;
  problemId: number;
  examId: number | null;
  mode: AiAssistMode;
  now?: number;
};

const buckets = new Map<string, number>();

function keyOf({ userId, problemId, examId, mode }: CooldownInput) {
  return `${userId}:${problemId}:${examId ?? "practice"}:${mode}`;
}

export function consumeAiAssistCooldown(input: CooldownInput) {
  const now = input.now ?? Date.now();
  const key = keyOf(input);
  const lastUsedAt = buckets.get(key);

  if (lastUsedAt !== undefined) {
    const elapsed = now - lastUsedAt;
    if (elapsed < AI_ASSIST_COOLDOWN_MS) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((AI_ASSIST_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  buckets.set(key, now);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearAiAssistCooldowns() {
  buckets.clear();
}
