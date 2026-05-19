/**
 * Distributed rate limiting backed by Upstash Redis.
 *
 * Activates when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
 * in the env. If they're missing (local dev without Upstash), falls back to
 * an in-memory limiter that resets on each serverless invocation — i.e. only
 * useful for dev, not production.
 *
 * Use:
 *   const ok = await checkRateLimit("comment", request);
 *   if (!ok) return new Response("Too many requests", { status: 429 });
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Action = "comment" | "report";

const LIMITS: Record<Action, { max: number; windowSec: number }> = {
  comment: { max: 5, windowSec: 60 },
  report: { max: 3, windowSec: 60 },
};

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = getRedis();

const upstashLimiters: Record<Action, Ratelimit | null> = redis
  ? {
      comment: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LIMITS.comment.max, `${LIMITS.comment.windowSec} s`),
        analytics: true,
        prefix: "rl:comment",
      }),
      report: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LIMITS.report.max, `${LIMITS.report.windowSec} s`),
        analytics: true,
        prefix: "rl:report",
      }),
    }
  : { comment: null, report: null };

// In-memory fallback. Keys are "action:ip", values are arrays of timestamps.
const memBuckets = new Map<string, number[]>();

function checkInMemory(action: Action, ip: string): boolean {
  const key = `${action}:${ip}`;
  const cfg = LIMITS[action];
  const now = Date.now();
  const cutoff = now - cfg.windowSec * 1000;
  const recent = (memBuckets.get(key) || []).filter((t) => t > cutoff);
  if (recent.length >= cfg.max) {
    memBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  memBuckets.set(key, recent);
  return true;
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export async function checkRateLimit(action: Action, request: Request): Promise<boolean> {
  const ip = getClientIp(request);
  const limiter = upstashLimiters[action];
  if (limiter) {
    const result = await limiter.limit(ip);
    return result.success;
  }
  return checkInMemory(action, ip);
}

/** True when running against real Upstash (vs the in-memory fallback). */
export function isDistributedRateLimit(): boolean {
  return redis !== null;
}
