import { createHash } from "node:crypto";
import type { AiAssistMode } from "@/lib/aiAssist";

const aiAssistAdviceCacheTtlMs = 5 * 60 * 1000;
const maxAiAssistAdviceCacheSize = 500;

type CacheEntry = {
  advice: string;
  expiresAt: number;
};

const adviceCache = new Map<string, CacheEntry>();

export function createAiAssistAdviceCacheKey({
  mode,
  problemId,
  prompt,
  providerFingerprint,
}: {
  mode: AiAssistMode;
  problemId: number;
  prompt: string;
  providerFingerprint: string;
}) {
  const promptHash = createHash("sha256").update(prompt).digest("hex");
  return `${mode}:${problemId}:${providerFingerprint}:${promptHash}`;
}

export function getCachedAiAssistAdvice({
  key,
  now = Date.now(),
}: {
  key: string;
  now?: number;
}) {
  const cached = adviceCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= now || !cached.advice.trim()) {
    adviceCache.delete(key);
    return null;
  }

  return cached.advice;
}

export function setCachedAiAssistAdvice({
  advice,
  key,
  now = Date.now(),
}: {
  advice: string;
  key: string;
  now?: number;
}) {
  const cleaned = advice.trim();
  if (!cleaned) return false;

  if (adviceCache.size >= maxAiAssistAdviceCacheSize) {
    pruneExpiredAiAssistAdvice(now);
  }
  if (adviceCache.size >= maxAiAssistAdviceCacheSize) {
    const oldestKey = adviceCache.keys().next().value;
    if (oldestKey) adviceCache.delete(oldestKey);
  }

  adviceCache.set(key, {
    advice: cleaned,
    expiresAt: now + aiAssistAdviceCacheTtlMs,
  });
  return true;
}

export function clearAiAssistAdviceCache() {
  adviceCache.clear();
}

function pruneExpiredAiAssistAdvice(now: number) {
  for (const [key, cached] of adviceCache) {
    if (cached.expiresAt <= now || !cached.advice.trim()) {
      adviceCache.delete(key);
    }
  }
}
