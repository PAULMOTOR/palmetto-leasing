import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { studioTilePath } from "@/lib/leasing/thumb-url";
import type { DeskDeal } from "@/lib/desk/types";

type HeroRow = {
  id: string;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  tile_rev: number | null;
};

function cleanVin(vin: string): string {
  return (vin || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function extractVin(...parts: Array<string | null | undefined>): string {
  const blob = parts.filter(Boolean).join(" ").toUpperCase();
  const m = blob.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  if (m) return m[0];
  const stripped = cleanVin(blob);
  return stripped.length === 17 ? stripped : "";
}

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/mercedes-benz/g, "mercedes")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function modelKey(make: string, model: string): string {
  let m = norm(model)
    .replace(/\b(spider|spyder|coupe|cabriolet|convertible|roadster|gtb|gts|f1|lusso|targa)\b/g, " ")
    .replace(/\bg\s*(class|550|63|wagen)\b/g, "gclass")
    .replace(/\bgt\s*r\b/g, "gtr")
    .replace(/\s+/g, " ")
    .trim();
  return `${norm(make)}|${m}`;
}

function usableHero(url?: string | null): string {
  const u = (url || "").trim();
  if (!u || u.startsWith("data:")) return "";
  if (u.startsWith("/") || /^https?:\/\//i.test(u)) return u;
  return "";
}

export function absoluteHeroUrl(url?: string | null): string {
  const u = usableHero(url);
  if (!u) return "";
  if (u.startsWith("http")) return u;
  return `https://www.palmettoleasing.com${u}`;
}

function tileOf(row: HeroRow): string {
  return studioTilePath(row.id, Number(row.tile_rev) || 1);
}

function scoreRow(row: HeroRow, deal: Pick<DeskDeal, "vin" | "year" | "make" | "model" | "vehicle">): number {
  const dealVin = extractVin(deal.vin, deal.vehicle);
  const rowVin = cleanVin(row.vin);
  if (dealVin && rowVin && dealVin === rowVin) return 100;
  if (dealVin && rowVin && dealVin.length >= 8 && rowVin.length >= 8) {
    if (dealVin.slice(-8) === rowVin.slice(-8)) return 90;
  }
  const dk = modelKey(deal.make, deal.model);
  const rk = modelKey(row.make, row.model);
  if (!dk.endsWith("|") && dk === rk) {
    if (deal.year && row.year && Number(deal.year) === Number(row.year)) return 80;
    return 55;
  }
  const hay = norm(`${deal.year || ""} ${deal.make} ${deal.model} ${deal.vehicle}`);
  const makeN = norm(row.make);
  const modelN = norm(row.model);
  const token = modelN.split(" ")[0] || "";
  if (makeN && token && hay.includes(makeN) && hay.includes(token)) {
    if (deal.year && row.year && Number(deal.year) === Number(row.year)) return 70;
    return 50;
  }
  return 0;
}

async function loadHeroRows(dealerId: string, vins: string[]): Promise<HeroRow[]> {
  await ensurePortalSchema();
  const sql = await getSql();
  const byDealer = await sql<HeroRow>`
    select id, coalesce(vin, '') as vin, year, make, model, coalesce(tile_rev, 1) as tile_rev
    from vehicles
    where dealership_id = ${dealerId}
      and status = 'active'
      and thumbnail_url like 'data:image/%'
  `;
  const need = vins.filter((v) => v.length === 17 && !byDealer.some((r) => cleanVin(r.vin) === v));
  if (!need.length) return byDealer;
  const extras: HeroRow[] = [];
  try {
    for (const vin of need.slice(0, 24)) {
      const rows = await sql<HeroRow>`
        select id, coalesce(vin, '') as vin, year, make, model, coalesce(tile_rev, 1) as tile_rev
        from vehicles
        where status = 'active'
          and thumbnail_url like 'data:image/%'
          and regexp_replace(upper(coalesce(vin, '')), '[^A-Z0-9]', '', 'g') = ${vin}
        limit 1
      `;
      if (rows[0]) extras.push(rows[0]);
    }
  } catch {
    /* VIN column may be empty; dealer-year-make-model match still runs */
  }
  return [...byDealer, ...extras];
}

export async function attachHeroShots<
  T extends Pick<DeskDeal, "vin" | "heroUrl" | "year" | "make" | "model" | "vehicle">,
>(deals: T[], dealerId?: string): Promise<T[]> {
  if (!deals.length) return deals;
  let rows: HeroRow[] = [];
  try {
    rows = await loadHeroRows(dealerId || "", deals.map((d) => extractVin(d.vin, d.vehicle)));
  } catch {
    rows = [];
  }
  return deals.map((d) => {
    let best: HeroRow | null = null;
    let bestScore = 0;
    for (const row of rows) {
      const s = scoreRow(row, d);
      if (s > bestScore) {
        bestScore = s;
        best = row;
      }
    }
    const url = (bestScore >= 50 && best ? tileOf(best) : "") || usableHero(d.heroUrl);
    return url ? { ...d, heroUrl: url, vin: extractVin(d.vin, d.vehicle) || d.vin } : { ...d, vin: extractVin(d.vin, d.vehicle) || d.vin };
  });
}

export async function heroShotByVin(vin: string, extra?: { dealerId?: string; year?: number | null; make?: string; model?: string }): Promise<string> {
  const [one] = await attachHeroShots(
    [
      {
        vin,
        heroUrl: "",
        year: extra?.year ?? null,
        make: extra?.make || "",
        model: extra?.model || "",
        vehicle: "",
      },
    ],
    extra?.dealerId,
  );
  return one?.heroUrl || "";
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
  const heroSrc = absoluteHeroUrl(opts.heroUrl);
  const hero = heroSrc
    ? `<tr><td style="padding:0 0 20px">
        <img src="${heroSrc}" width="240" height="240" alt="${escapeHtml(vehicle)}"
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