import type { APIRoute } from "astro";
import { getTopLikes } from "../../../lib/likes";

export const prerender = false;

// Return more than the home page shows so it can skip keys for posts that no
// longer exist and still fill its list.
const LIMIT = 20;

export const GET: APIRoute = async () => {
  const top = await getTopLikes(LIMIT);
  return new Response(JSON.stringify({ top }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
};
