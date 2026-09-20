import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { inventoryTileHandoffUrl } from "@/lib/leasing/thumb-url";
import { isStudioThumbUrl } from "@/lib/imagine/persist-image";
import type { DeskDeal } from "@/lib/desk/types";

function cleanVin(vin: string): string {
  return vin.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export async function heroShotByVin(vin: string): Promise<string> {
  const map = await heroShotsByVins([vin]);
  return map.get(cleanVin(vin)) || "";
}

export async function heroShotsByVins(vins: string[]): Promise<Map<string, string>> {
  const keys = [...new Set(vins.map(cleanVin).filter((v) => v.length >= 11))];
  const out = new Map<string, string>();
  if (!keys.length) return out;
  try {
    await ensurePortalSchema();
    const sql = await getSql();
    const rows = await sql.query<{
      vin: string;
      id: string;
      thumbnail_url: string;
      tile_rev: number | null;
    }>(
      `select coalesce(vin, '') as vin, id, thumbnail_url, coalesce(tile_rev, 1) as tile_rev
       from vehicles
       where status = 'active'
         and thumbnail_url like 'data:image/%'
         and upper(replace(coalesce(vin, ''), ' ', '')) in (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
      keys,
    );
    for (const r of rows) {
      const vin = cleanVin(r.vin);
      if (!vin || !isStudioThumbUrl(r.thumbnail_url)) continue;
      out.set(vin, inventoryTileHandoffUrl(r.id, undefined, Number(r.tile_rev) || 1));
    }
  } catch {
    /* preview without inventory */
  }
  return out;
}

export async function attachHeroShots<T extends Pick<DeskDeal, "vin" | "heroUrl">>(deals: T[]): Promise<T[]> {
  const map = await heroShotsByVins(deals.map((d) => d.vin));
  return deals.map((d) => {
    const url = map.get(cleanVin(d.vin)) || d.heroUrl || "";
    return url ? { ...d, heroUrl: url } : d;
  });
}

export function creditAppMail(opts: {
  dealerName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  vehicle: string;
  creditUrl: string;
  heroUrl?: string;
}): { subject: string; text: string; html: string } {
  const vehicle = opts.vehicle || "your Palmetto lease";
  const q = [opts.contactEmail, opts.contactPhone].filter(Boolean).join(" · ");
  const hero = opts.heroUrl
    ? `<tr><td style="padding:0 0 20px">
        <img src="${opts.heroUrl}" width="240" height="240" alt="${escapeHtml(vehicle)}"
          style="display:block;width:240px;height:240px;object-fit:cover;border-radius:16px;background:#fff;border:1px solid #e7e5e0"/>
      </td></tr>`
    : "";
  return {
    subject: `Credit application — ${vehicle}`,
    text: `${opts.contactName} at ${opts.dealerName} sent you a Palmetto credit application for ${vehicle}.\n\n${opts.creditUrl}\n\nQuestions: ${q}`,
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;font-family:Georgia,serif;color:#1a1916">
      ${hero}
      <tr><td style="padding:0 0 12px;font-size:16px">
        ${escapeHtml(opts.contactName)} at ${escapeHtml(opts.dealerName)} sent you a Palmetto credit application for
        <strong>${escapeHtml(vehicle)}</strong>.
      </td></tr>
      <tr><td style="padding:0 0 16px">
        <a href="${opts.creditUrl}" style="display:inline-block;background:#1a1916;color:#f6f3ee;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px">
          Open credit app
        </a>
      </td></tr>
      <tr><td style="font-size:12px;color:#6b6560">Questions: ${escapeHtml(q)}</td></tr>
    </table>`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    return "\u0026quot;";
  });
}