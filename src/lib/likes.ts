import { redis } from "./redis";

// Sorted set: member = post key (e.g. "blog/my-slug"), score = like count.
const LIKES_KEY = "likes";
const votersKey = (postKey: string) => `likes:voters:${postKey}`;

// Record the voter and bump the count atomically; a repeat voter just gets the current count.
const ADD_LIKE_SCRIPT = `
if redis.call('SADD', KEYS[2], ARGV[2]) == 1 then
  return redis.call('ZINCRBY', KEYS[1], 1, ARGV[1])
end
return redis.call('ZSCORE', KEYS[1], ARGV[1]) or 0
`;

export async function getLikes(postKey: string): Promise<number> {
  const score = await redis.zscore(LIKES_KEY, postKey);
  return Number(score ?? 0);
}

export async function addLike(postKey: string, voterHash: string): Promise<number> {
  const count = await redis.eval<string[], string | number>(
    ADD_LIKE_SCRIPT,
    [LIKES_KEY, votersKey(postKey)],
    [postKey, voterHash],
  );
  return Number(count);
}

export async function hashVoter(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + import.meta.env.LIKE_SALT);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getTopLikes(limit: number): Promise<{ postKey: string; count: number }[]> {
  const flat = await redis.zrange<(string | number)[]>(LIKES_KEY, 0, limit - 1, {
    rev: true,
    withScores: true,
  });
  const top: { postKey: string; count: number }[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    top.push({ postKey: String(flat[i]), count: Number(flat[i + 1]) });
  }
  return top;
}
