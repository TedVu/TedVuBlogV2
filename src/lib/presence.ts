import { redis } from "./redis";

// Sorted set: member = anonymous visitor id, score = time of last heartbeat (ms).
const PRESENCE_KEY = "presence";
// A reader counts as active if they checked in within this window. Keep it at
// about twice the client's heartbeat interval so one late request doesn't drop them.
export const ACTIVE_WINDOW_MS = 60_000;

// Record the heartbeat, drop stale readers, and count who's left. Stale entries
// are only cleaned up here, right before counting, so no background job is needed.
export async function heartbeat(visitorId: string): Promise<number> {
  const now = Date.now();
  const [, , count] = await redis
    .pipeline()
    .zadd(PRESENCE_KEY, { score: now, member: visitorId })
    .zremrangebyscore(PRESENCE_KEY, 0, now - ACTIVE_WINDOW_MS)
    .zcard(PRESENCE_KEY)
    // Let Redis delete the whole set if the site goes quiet.
    .expire(PRESENCE_KEY, (ACTIVE_WINDOW_MS / 1000) * 2)
    .exec<[number, number, number, number]>();
  return count;
}

export async function leave(visitorId: string): Promise<void> {
  await redis.zrem(PRESENCE_KEY, visitorId);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read the visitor id from a JSON body. sendBeacon posts it as text/plain, so
// parse the raw text rather than relying on the Content-Type header.
export async function readVisitorId(request: Request): Promise<string | null> {
  try {
    const { visitorId } = JSON.parse(await request.text());
    return typeof visitorId === "string" && UUID_RE.test(visitorId) ? visitorId : null;
  } catch {
    return null;
  }
}
