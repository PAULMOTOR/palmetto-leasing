import { createFileRoute } from "@tanstack/react-router";
import { runInventoryCrawl } from "@/lib/crawler/run";

export const maxDuration = 300;

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method === "GET") {
    return Response.json({ ok: true, crawl: "/api/admin/crawl" });
  }
  let body: { token?: string; dealerIds?: string[]; generateThumbs?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.token !== "admin-ok") {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runInventoryCrawl({
      dealerIds: body.dealerIds,
      generateThumbs: body.generateThumbs !== false,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/admin/crawl")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
      OPTIONS: async ({ request }) => handle(request),
    },
  },
});
