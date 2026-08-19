import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { palmettoOrigin } from "@/lib/leasing/thumb-url";

const PLACEHOLDER = "/vehicles/top-porsche-911.jpg";

function cors(headers: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    ...headers,
  };
}

function redirectTo(path: string) {
  const loc = /^https?:\/\//i.test(path)
    ? path
    : `${palmettoOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
  return new Response(null, {
    status: 302,
    headers: cors({ Location: loc, "Cache-Control": "public, max-age=120" }),
  });
}

function dataUriToResponse(uri: string): Response | null {
  const m = uri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  try {
    const buf = Buffer.from(m[2]!.replace(/\s/g, ""), "base64");
    if (buf.length < 400) return null;
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": m[1]!,
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
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
      GET: async ({ params }) => {
        const id = decodeURIComponent(params.id || "").trim();
        if (!id || id.length > 160) return redirectTo(PLACEHOLDER);
        try {
          const sql = await getSql();
          const rows = await sql<{ thumbnail_url: string }>`
            select thumbnail_url from vehicles
            where id = ${id} and status = 'active'
            limit 1
          `;
          const thumb = rows[0]?.thumbnail_url || "";
          if (thumb.startsWith("data:image/")) {
            return dataUriToResponse(thumb) ?? redirectTo(PLACEHOLDER);
          }
          if (/^https?:\/\//i.test(thumb) && !/imgen\.x\.ai|xai-tmp-imgen/i.test(thumb)) {
            return redirectTo(thumb);
          }
          if (thumb.startsWith("/") && !thumb.startsWith("//")) {
            return redirectTo(thumb);
          }
        } catch {
          /* fall through */
        }
        return redirectTo(PLACEHOLDER);
      },
    },
  },
});
