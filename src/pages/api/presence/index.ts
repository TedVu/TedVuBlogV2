import type { APIRoute } from "astro";
import { heartbeat, readVisitorId } from "../../../lib/presence";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const POST: APIRoute = async ({ request }) => {
  const visitorId = await readVisitorId(request);
  if (!visitorId) return json({ error: "Invalid visitor" }, 400);
  return json({ count: await heartbeat(visitorId) });
};
