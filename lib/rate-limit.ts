type Entry = { count: number; windowStart: number };

const store = new Map<string, Entry>();

function evict(windowMs: number) {
  if (store.size < 5_000) return;
  const cutoff = Date.now() - windowMs;
  for (const [key, entry] of store) {
    if (entry.windowStart < cutoff) store.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    evict(windowMs);
    return { allowed: true, remaining: limit - 1 };
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed: entry.count <= limit, remaining };
}

export function rateLimitKey(req: { headers: { get(name: string): string | null } }, prefix: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? (forwarded.split(",").at(-1)?.trim() ?? "unknown") : "unknown";
  return `${prefix}:${ip}`;
}
