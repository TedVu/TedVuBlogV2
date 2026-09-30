import type { APIRoute } from "astro";
import { leave, readVisitorId } from "../../../lib/presence";

export const prerender = false;

// Called via navigator.sendBeacon when a tab closes, so the count drops right
// away. Best effort only: the heartbeat window still removes readers whose
// browser never sends this.
export const POST: APIRoute = async ({ request }) => {
  const visitorId = await readVisitorId(request);
  if (visitorId) await leave(visitorId);
  return new Response(null, { status: 204 });
};
