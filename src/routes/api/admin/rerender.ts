import { createFileRoute } from "@tanstack/react-router";
import {
  generateVehicleThumbById,
  generateVehicleThumbFromUploads,
} from "@/lib/imagine/batch-thumbs";

export const maxDuration = 120;

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }
  if (request.method === "GET") {
    return Response.json({
      ok: true,
      recipe: "1k-b64",
      sha: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    });
  }
  let body: {
    token?: string;
    vehicleId?: string;
    front?: string;
    rear?: string;
    interior?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.token !== "admin-ok") {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const vehicleId = String(body.vehicleId || "").trim();
  if (!vehicleId) {
    return Response.json({ ok: false, error: "Missing vehicle" }, { status: 400 });
  }
  const hasUploads = Boolean(body.front && body.rear && body.interior);
  try {
    const result = hasUploads
      ? await generateVehicleThumbFromUploads(vehicleId, {
          front: String(body.front),
          rear: String(body.rear),
          interior: String(body.interior),
        })
      : await generateVehicleThumbById(vehicleId);
    return Response.json({
      ...result,
      recipe: hasUploads ? "uploads-1k" : "1k-b64",
      sha: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    });
  } catch (err) {
    return Response.json(
      { ok: false, hasApiKey: true, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/admin/rerender")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
      OPTIONS: async ({ request }) => handle(request),
    },
  },
});
