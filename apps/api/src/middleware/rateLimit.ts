import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function resolveBaseLimitPerMinute(): number {
  const parsed = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 180);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 180;
}

function resolveLimitPerMinute(req: Request): number {
  const base = resolveBaseLimitPerMinute();
  const hasApiKey = Boolean(req.header("x-api-key")?.trim() || req.header("authorization")?.trim());
  if (hasApiKey && req.path.startsWith("/workspace")) {
    return base * 4;
  }
  return base;
}

function clientKey(req: Request): string {
  const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  if (req.path === "/health") {
    next();
    return;
  }

  const limit = resolveLimitPerMinute(req);
  const key = clientKey(req);
  const now = Date.now();
  const windowMs = 60_000;

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
    return;
  }

  next();
}
