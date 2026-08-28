import { createFileRoute } from "@tanstack/react-router";
import { generateMissingImagineThumbs } from "@/lib/imagine/batch-thumbs";

/** Small batches so Vercel’s 120s cap can finish. ~15s per studio tile. */
export const maxDuration = 120;

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method === "GET") {
    return Response.json({ ok: true, thumbs: "/api/admin/thumbs" });
  }
  let body: { token?: string; limit?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.token !== "admin-ok") {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 8);
  try {
    const result = await generateMissingImagineThumbs({ limit });
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
