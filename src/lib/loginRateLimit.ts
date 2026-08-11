const MAX_ACCOUNT_FAILURES = 5;
const MAX_IP_FAILURES = 20;
const LOGIN_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const LOGIN_BUCKET_IDLE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_MAX_BUCKETS = 10_000;
const DEFAULT_MAX_GLOBAL_VERIFICATIONS = 16;
const DEFAULT_MAX_IP_VERIFICATIONS = 4;
const DEFAULT_MAX_ACCOUNT_VERIFICATIONS = 1;

type LoginFailureBucket = {
  blockedUntil: number;
  failedAt: number[];
  lastTouchedAt: number;
};

const buckets = new Map<string, LoginFailureBucket>();
const activeVerificationsByAccount = new Map<string, number>();
const activeVerificationsByIp = new Map<string, number>();
let activeVerificationCount = 0;

function readBoundedPositiveInt(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function incrementCounter(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function decrementCounter(map: Map<string, number>, key: string) {
  const next = (map.get(key) ?? 0) - 1;
  if (next > 0) map.set(key, next);
  else map.delete(key);
}

function readMaxBuckets() {
  const parsed = Number(process.env.LOGIN_RATE_LIMIT_MAX_BUCKETS);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, 100_000)
    : DEFAULT_MAX_BUCKETS;
}

function prune(bucket: LoginFailureBucket, now: number) {
  bucket.failedAt = bucket.failedAt.filter(
    (timestamp) => now - timestamp <= LOGIN_FAILURE_WINDOW_MS,
  );
  if (bucket.blockedUntil <= now) bucket.blockedUntil = 0;
}

function isExpired(bucket: LoginFailureBucket, now: number) {
  return (
    bucket.blockedUntil === 0 &&
    bucket.failedAt.length === 0 &&
    now - bucket.lastTouchedAt > LOGIN_BUCKET_IDLE_TTL_MS
  );
}

function getExistingBucket(key: string, now: number) {
  const bucket = buckets.get(key);
  if (!bucket) return null;
  prune(bucket, now);
  if (isExpired(bucket, now)) {
    buckets.delete(key);
    return null;
  }
  return bucket;
}

function makeCapacityForNewBucket(now: number) {
  for (const [key, bucket] of buckets) {
    prune(bucket, now);
    if (isExpired(bucket, now)) buckets.delete(key);
  }

  const maxBuckets = readMaxBuckets();
  while (buckets.size >= maxBuckets) {
    let oldestKey: string | null = null;
    let oldestTouchedAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of buckets) {
      if (bucket.lastTouchedAt < oldestTouchedAt) {
        oldestKey = key;
        oldestTouchedAt = bucket.lastTouchedAt;
      }
    }
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

function recordFailure(key: string, maxFailures: number, now: number) {
  let bucket = getExistingBucket(key, now);
  if (!bucket) {
    makeCapacityForNewBucket(now);
    bucket = { blockedUntil: 0, failedAt: [], lastTouchedAt: now };
    buckets.set(key, bucket);
  }
  bucket.lastTouchedAt = now;
  bucket.failedAt.push(now);

  if (bucket.failedAt.length >= maxFailures) {
    bucket.blockedUntil = now + LOGIN_BLOCK_MS;
  }
}

export function getLoginRateLimitStatus(key: string, now = Date.now()) {
  const bucket = getExistingBucket(key, now);
  if (!bucket) return { limited: false, retryAfterSeconds: 0 };

  if (bucket.blockedUntil > now) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  return { limited: false, retryAfterSeconds: 0 };
}

export function recordFailedLogin(key: string, now = Date.now()) {
  recordFailure(key, MAX_ACCOUNT_FAILURES, now);
}

export function recordFailedLoginForIp(key: string, now = Date.now()) {
  recordFailure(key, MAX_IP_FAILURES, now);
}

export function clearLoginFailures(key: string) {
  buckets.delete(key);
}

export function clearAllLoginFailures() {
  buckets.clear();
}

export function reserveLoginVerification(accountKey: string, ipKey: string) {
  const maxGlobal = readBoundedPositiveInt(
    process.env.LOGIN_MAX_IN_FLIGHT_GLOBAL,
    DEFAULT_MAX_GLOBAL_VERIFICATIONS,
    256,
  );
  const maxPerIp = readBoundedPositiveInt(
    process.env.LOGIN_MAX_IN_FLIGHT_PER_IP,
    DEFAULT_MAX_IP_VERIFICATIONS,
    64,
  );
  const maxPerAccount = readBoundedPositiveInt(
    process.env.LOGIN_MAX_IN_FLIGHT_PER_ACCOUNT,
    DEFAULT_MAX_ACCOUNT_VERIFICATIONS,
    16,
  );
  if (
    activeVerificationCount >= maxGlobal ||
    (activeVerificationsByIp.get(ipKey) ?? 0) >= maxPerIp ||
    (activeVerificationsByAccount.get(accountKey) ?? 0) >= maxPerAccount
  ) {
    return {
      allowed: false as const,
      release() {},
      retryAfterSeconds: 1,
    };
  }

  activeVerificationCount += 1;
  incrementCounter(activeVerificationsByIp, ipKey);
  incrementCounter(activeVerificationsByAccount, accountKey);
  let released = false;
  return {
    allowed: true as const,
    release() {
      if (released) return;
      released = true;
      activeVerificationCount -= 1;
      decrementCounter(activeVerificationsByIp, ipKey);
      decrementCounter(activeVerificationsByAccount, accountKey);
    },
    retryAfterSeconds: 0,
  };
}

export function clearAllLoginVerificationReservations() {
  activeVerificationsByAccount.clear();
  activeVerificationsByIp.clear();
  activeVerificationCount = 0;
}

export function getLoginRateLimitBucketCount() {
  return buckets.size;
}

export function getLoginClientIp(request: Request) {
  // Nginx writes this header from $remote_addr. Prefer it over an X-Forwarded-For
  // chain, whose leftmost value can be supplied by an untrusted client.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  // When a trusted proxy appends the peer address, the rightmost value is the
  // closest trusted hop. This is only a fallback for local development.
  return forwardedFor.split(",").at(-1)?.trim() || "unknown";
}

export function loginRateLimitKey(request: Request, username: string) {
  return `${getLoginClientIp(request)}:${username.trim().toLowerCase()}`;
}

export function loginIpRateLimitKey(request: Request) {
  return `ip:${getLoginClientIp(request)}`;
}
