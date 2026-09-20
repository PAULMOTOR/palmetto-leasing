import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

function cors(headers: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    ...headers,
  };
}

function notFound() {
  return new Response(null, {
    status: 404,
    headers: cors({ "Cache-Control": "no-store" }),
  });
}

function dataUriToResponse(uri: string, versioned: boolean): Response | null {
  const raw = (uri || "").trim();
  if (!raw.startsWith("data:image/")) return null;
  const comma = raw.indexOf(",");
  if (comma < 12) return null;
  const meta = raw.slice("data:".length, comma);
  const b64 = raw.slice(comma + 1).replace(/\s/g, "");
  if (b64.length < 400) return null;
  const ctype = (meta.split(";")[0] || "image/jpeg").trim() || "image/jpeg";
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 400) return null;
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": ctype,
        "Content-Length": String(buf.length),
        "Cache-Control": versioned
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/thumb/$id")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: cors({ "Access-Control-Max-Age": "86400" }),
        }),
      GET: async ({ params, request }) => {
        const id = decodeURIComponent(params.id || "").trim();
        if (!id || id.length > 160) return notFound();
        const versioned = Boolean(new URL(request.url).searchParams.get("v"));
        try {
          const sql = await getSql();
          const rows = await sql<{ thumbnail_url: string }>`
            select thumbnail_url from vehicles
            where id = ${id} and status = 'active'
            limit 1
          `;
          const thumb = rows[0]?.thumbnail_url || "";
          if (thumb.startsWith("data:image/")) {
            return dataUriToResponse(thumb, versioned) ?? notFound();
          }
        } catch {
          /* fall through */
        }
        return notFound();
      },
    },
  },
});
