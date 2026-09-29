import type { APIRoute } from "astro";
import { addLike, getLikes, hashVoter } from "../../../../lib/likes";

export const prerender = false;

const SECTIONS = new Set(["blog", "viet"]);
const SLUG_RE = /^[A-Za-z0-9_-]{1,160}$/;

function postKeyFrom(params: Record<string, string | undefined>): string | null {
  const { section, slug } = params;
  if (!section || !slug || !SECTIONS.has(section) || !SLUG_RE.test(slug)) return null;
  return `${section}/${slug}`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const GET: APIRoute = async ({ params }) => {
  const postKey = postKeyFrom(params);
  if (!postKey) return json({ error: "Invalid post" }, 400);
  return json({ count: await getLikes(postKey) });
};

export const POST: APIRoute = async ({ params, clientAddress }) => {
  const postKey = postKeyFrom(params);
  if (!postKey) return json({ error: "Invalid post" }, 400);
  const count = await addLike(postKey, await hashVoter(clientAddress));
  return json({ count });
};
