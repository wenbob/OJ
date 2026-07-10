const MAX_LOGIN_FAILURES = 5;
const LOGIN_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;

type LoginFailureBucket = {
  blockedUntil: number;
  failedAt: number[];
};

const buckets = new Map<string, LoginFailureBucket>();

function currentBucket(key: string) {
  const bucket = buckets.get(key) ?? { blockedUntil: 0, failedAt: [] };
  buckets.set(key, bucket);
  return bucket;
}

function prune(bucket: LoginFailureBucket, now: number) {
  bucket.failedAt = bucket.failedAt.filter(
    (timestamp) => now - timestamp <= LOGIN_FAILURE_WINDOW_MS,
  );
}

export function getLoginRateLimitStatus(key: string, now = Date.now()) {
  const bucket = currentBucket(key);
  prune(bucket, now);

  if (bucket.blockedUntil > now) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  return { limited: false, retryAfterSeconds: 0 };
}

export function recordFailedLogin(key: string, now = Date.now()) {
  const bucket = currentBucket(key);
  prune(bucket, now);
  bucket.failedAt.push(now);

  if (bucket.failedAt.length >= MAX_LOGIN_FAILURES) {
    bucket.blockedUntil = now + LOGIN_BLOCK_MS;
  }
}

export function clearLoginFailures(key: string) {
  buckets.delete(key);
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
