import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { sweepDeadListings } from "@/lib/crawler/dead-listings";

/** Vercel Cron: drop sold/404 listings so Admin → Renders stays current. */
export const maxDuration = 60;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") || "";
    const url = new URL(request.url);
    const q = url.searchParams.get("secret");
    if (auth !== `Bearer ${secret}` && q !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await ensurePortalSchema();
    const sql = await getSql();
    const result = await sweepDeadListings(sql, { limit: 200, concurrency: 8 });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/sweep")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
