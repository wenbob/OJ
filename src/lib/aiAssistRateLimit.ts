import type { AiModelProfile } from "@/lib/aiProvider";

export const DEFAULT_AI_ASSIST_MAX_CONCURRENCY = 2;
export const AI_ASSIST_BUSY_RETRY_SECONDS = 10;

type ReserveAiProviderRequestInput = {
  accountId: number;
  cooldownSeconds: number;
  maxConcurrency?: number;
  now?: number;
  profile: AiModelProfile;
  requestKey?: string;
};

const cooldowns = new Map<string, number>();
const activeAccountProfileKeys = new Set<string>();
const activeResourceKeys = new Set<string>();
let activeReservationCount = 0;

function accountProfileKey({
  accountId,
  profile,
}: Pick<ReserveAiProviderRequestInput, "accountId" | "profile">) {
  return `${profile}:${accountId}`;
}

function readMaxConcurrency(value = process.env.AI_ASSIST_MAX_CONCURRENCY) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_AI_ASSIST_MAX_CONCURRENCY;
}

export function reserveAiProviderRequest({
  accountId,
  cooldownSeconds,
  maxConcurrency,
  now = Date.now(),
  profile,
  requestKey,
}: ReserveAiProviderRequestInput) {
  const accountKey = accountProfileKey({ accountId, profile });
  const lastProviderRequestAt = cooldowns.get(accountKey);
  const cooldownMs = cooldownSeconds * 1_000;
  if (
    lastProviderRequestAt !== undefined &&
    now - lastProviderRequestAt < cooldownMs
  ) {
    return {
      allowed: false as const,
      reason: "cooldown" as const,
      retryAfterSeconds: Math.ceil(
        (cooldownMs - (now - lastProviderRequestAt)) / 1_000,
      ),
    };
  }

  if (activeAccountProfileKeys.has(accountKey)) {
    return {
      allowed: false as const,
      reason: "user_busy" as const,
      retryAfterSeconds: AI_ASSIST_BUSY_RETRY_SECONDS,
    };
  }
  if (requestKey && activeResourceKeys.has(requestKey)) {
    return {
      allowed: false as const,
      reason: "request_busy" as const,
      retryAfterSeconds: AI_ASSIST_BUSY_RETRY_SECONDS,
    };
  }

  const limit = readMaxConcurrency(
    maxConcurrency === undefined ? undefined : String(maxConcurrency),
  );
  if (activeReservationCount >= limit) {
    return {
      allowed: false as const,
      reason: "server_busy" as const,
      retryAfterSeconds: AI_ASSIST_BUSY_RETRY_SECONDS,
    };
  }

  activeAccountProfileKeys.add(accountKey);
  if (requestKey) activeResourceKeys.add(requestKey);
  activeReservationCount += 1;
  let providerRequestStarted = false;
  let released = false;

  return {
    allowed: true as const,
    markProviderRequest(providerRequestAt = Date.now()) {
      if (providerRequestStarted) return;
      providerRequestStarted = true;
      cooldowns.set(accountKey, providerRequestAt);
    },
    providerRequestStarted() {
      return providerRequestStarted;
    },
    release() {
      if (released) return;
      released = true;
      activeAccountProfileKeys.delete(accountKey);
      if (requestKey) activeResourceKeys.delete(requestKey);
      activeReservationCount = Math.max(0, activeReservationCount - 1);
    },
  };
}

export function reserveAiAssistRequest({
  cooldownSeconds,
  maxConcurrency,
  now,
  userId,
}: {
  cooldownSeconds: number;
  maxConcurrency?: number;
  now?: number;
  userId: number;
}) {
  return reserveAiProviderRequest({
    accountId: userId,
    cooldownSeconds,
    maxConcurrency,
    now,
    profile: "programming",
  });
}

export function clearAiAssistCooldowns() {
  cooldowns.clear();
  activeAccountProfileKeys.clear();
  activeResourceKeys.clear();
  activeReservationCount = 0;
}
