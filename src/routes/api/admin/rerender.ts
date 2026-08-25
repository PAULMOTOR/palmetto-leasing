import { createFileRoute } from "@tanstack/react-router";
import { generateVehicleThumbById } from "@/lib/imagine/batch-thumbs";
import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";

/** 1K Imagine still needs more than the default 15s window. */
export const maxDuration = 120;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

async function statusFor(vehicleId: string) {
  await ensurePortalSchema();
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    thumbnail_url: string;
    thumbnail_source: string;
    updated_at: string;
  }>`
    select id, thumbnail_url, coalesce(thumbnail_source, '') as thumbnail_source,
           updated_at::text as updated_at
    from vehicles
    where id = ${vehicleId}
    limit 1
  `;
  const r = rows[0];
  if (!r) return { ok: false, error: "Vehicle not found" };
  return {
    ok: true,
    vehicleId: r.id,
    hasStudio: (r.thumbnail_url || "").startsWith("data:image/"),
    source: r.thumbnail_source,
    updatedAt: r.updated_at,
  };
}

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

  const url = new URL(request.url);
  let token = url.searchParams.get("token") || "";
  let vehicleId = url.searchParams.get("vehicleId") || "";
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { token?: string; vehicleId?: string };
      token = body.token || token;
      vehicleId = body.vehicleId || vehicleId;
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
  }
  if (token !== "admin-ok") return json({ ok: false, error: "Unauthorized" }, 401);
  vehicleId = String(vehicleId || "").trim();
  if (!vehicleId) return json({ ok: false, error: "Missing vehicle" }, 400);

  if (request.method === "GET") {
    return json(await statusFor(vehicleId));
  }

  const work = generateVehicleThumbById(vehicleId);
  let background = false;
  try {
    const mod = await import("@vercel/functions");
    if (typeof mod.waitUntil === "function") {
      mod.waitUntil(work.then((r) => {
        if (!r.ok) console.error("[rerender]", vehicleId, r.error);
      }));
      background = true;
    }
  } catch {
    background = false;
  }

  if (background) {
    return json({ ok: true, hasApiKey: true, pending: true, vehicleId });
  }

  try {
    const result = await work;
    return json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, hasApiKey: true, error: message }, 500);
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
