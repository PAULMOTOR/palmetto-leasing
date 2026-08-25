import { createFileRoute } from "@tanstack/react-router";
import { generateVehicleThumbById } from "@/lib/imagine/batch-thumbs";

export const maxDuration = 120;

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }
  let body: { token?: string; vehicleId?: string } = {};
  try {
    body = (await request.json()) as { token?: string; vehicleId?: string };
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
  try {
    const result = await generateVehicleThumbById(vehicleId);
    return Response.json(result);
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
      POST: async ({ request }) => handle(request),
      OPTIONS: async ({ request }) => handle(request),
    },
  },
});
