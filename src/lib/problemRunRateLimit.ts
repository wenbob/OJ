export const PROBLEM_RUN_COOLDOWN_MS = 5_000;

const activeUsers = new Set<string>();
const completedAtByUser = new Map<string, number>();

export function reserveProblemRun({
  now = Date.now(),
  userId,
}: {
  now?: number;
  userId: number;
}) {
  const key = String(userId);
  if (activeUsers.has(key)) {
    return {
      allowed: false as const,
      reason: "busy" as const,
      retryAfterSeconds: 1,
    };
  }

  const lastCompletedAt = completedAtByUser.get(key);
  if (lastCompletedAt !== undefined) {
    const remainingMs = PROBLEM_RUN_COOLDOWN_MS - (now - lastCompletedAt);
    if (remainingMs > 0) {
      return {
        allowed: false as const,
        reason: "cooldown" as const,
        retryAfterSeconds: Math.ceil(remainingMs / 1000),
      };
    }
  }

  activeUsers.add(key);
  let released = false;

  return {
    allowed: true as const,
    cancel() {
      if (released) return;
      released = true;
      activeUsers.delete(key);
    },
    complete(completedAt = Date.now()) {
      if (released) return;
      released = true;
      activeUsers.delete(key);
      completedAtByUser.set(key, completedAt);
    },
  };
}

export function clearProblemRunRateLimits() {
  activeUsers.clear();
  completedAtByUser.clear();
}
