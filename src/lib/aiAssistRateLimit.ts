import type { AiAssistMode } from "@/lib/aiAssist";

export const AI_ASSIST_COOLDOWN_MS = 20_000;
export const DEFAULT_AI_ASSIST_MAX_CONCURRENCY = 2;
export const AI_ASSIST_BUSY_RETRY_SECONDS = 10;

type CooldownInput = {
  userId: number;
  problemId: number;
  examId: number | null;
  mode: AiAssistMode;
  now?: number;
};

const buckets = new Map<string, number>();
const activeUserIds = new Set<number>();

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

function readMaxConcurrency(value = process.env.AI_ASSIST_MAX_CONCURRENCY) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_AI_ASSIST_MAX_CONCURRENCY;
}

export function reserveAiAssistRequest({
  userId,
  maxConcurrency,
}: {
  userId: number;
  maxConcurrency?: number;
}) {
  if (activeUserIds.has(userId)) {
    return {
      allowed: false as const,
      reason: "user_busy" as const,
      retryAfterSeconds: AI_ASSIST_BUSY_RETRY_SECONDS,
    };
  }

  const limit = readMaxConcurrency(maxConcurrency === undefined ? undefined : String(maxConcurrency));
  if (activeUserIds.size >= limit) {
    return {
      allowed: false as const,
      reason: "server_busy" as const,
      retryAfterSeconds: AI_ASSIST_BUSY_RETRY_SECONDS,
    };
  }

  activeUserIds.add(userId);
  let released = false;

  return {
    allowed: true as const,
    release() {
      if (released) return;
      released = true;
      activeUserIds.delete(userId);
    },
  };
}

export function clearAiAssistCooldowns() {
  buckets.clear();
  activeUserIds.clear();
}
