const buckets = new Map<string, number[]>();

// In-memory sliding-window limiter — sufficient for this single-process deployment and avoids
// pulling in express-rate-limit for what's currently a single unauthenticated route group (public
// asset intake). Returns true when the caller has exceeded `max` hits within `windowMs`.
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  return hits.length > max;
}
