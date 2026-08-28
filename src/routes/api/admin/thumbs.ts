import { createFileRoute } from "@tanstack/react-router";
import { generateMissingImagineThumbs } from "@/lib/imagine/batch-thumbs";

/** Small batches so Vercel’s 120s cap can finish. ~15s per studio tile. */
export const maxDuration = 120;

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method === "GET") {
    return Response.json({ ok: true, thumbs: "/api/admin/thumbs", batch: 3 });
  }
  let body: { token?: string; limit?: number; dealer?: string; force?: boolean; match?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.token !== "admin-ok") {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const limit = Math.min(Math.max(Number(body.limit) || 3, 1), 4);
  const dealer = typeof body.dealer === "string" ? body.dealer.trim().toLowerCase() : "";
  const match = typeof body.match === "string" ? body.match.trim() : "";
  try {
    const result = await generateMissingImagineThumbs({
      limit,
      dealer: dealer || undefined,
      force: Boolean(body.force),
      match: match || undefined,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/admin/thumbs")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
      OPTIONS: async ({ request }) => handle(request),
    },
  },
});
