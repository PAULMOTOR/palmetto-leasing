import { createFileRoute } from "@tanstack/react-router";
import { runInventoryCrawl } from "@/lib/crawler/run";

/**
 * Vercel Cron: every 12 hours.
 * Secure with CRON_SECRET (Authorization: Bearer …) when set.
 */
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
    const result = await runInventoryCrawl({ forceIncludeAll: false });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/crawl")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
