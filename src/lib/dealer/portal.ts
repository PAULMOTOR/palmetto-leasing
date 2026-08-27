import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";
import { palmettoOrigin } from "@/lib/leasing/thumb-url";
import { sendMail } from "@/lib/mail/send";
import { loadImageSupportEmail } from "@/lib/admin/image-support";
import { formatCad, formatNumber } from "@/lib/utils";

const DEALER_PIN = () => process.env.DEALER_PIN?.trim() || "dealer";
const ADMIN_PIN = () => process.env.ADMIN_PIN?.trim() || "palmetto";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function dealerIdFromToken(token: string): string {
  if (!token.startsWith("dealer:")) throw new Error("Unauthorized");
  return token.slice("dealer:".length);
}

export type DealerPortalVehicle = {
  id: string;
  title: string;
  year: number;
  make: string;
  model: string;
  priceCents: number;
  mileage: number;
  hasStudio: boolean;
  tileUrl: string;
  listingUrl: string;
  vin: string;
};

export const listActiveDealersForLogin = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await ensurePortalSchema();
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; city: string; province: string }>`
      select id, name, city, province from dealerships
      where active = true
      order by name
    `;
    if (rows.length) return rows;
  } catch {
    /* seed fallback */
  }
  const { DEALERS } = await import("@/lib/leasing/seed");
  return DEALERS.filter((d) => d.active).map((d) => ({
    id: d.id,
    name: d.name,
    city: d.city,
    province: d.province,
  }));
});

export const dealerPortalLogin = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ dealerId: z.string().min(1), pin: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    await ensurePortalSchema();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      city: string;
      province: string;
      active: boolean;
      portal_pin: string | null;
      referral_fee_bps: number;
      quote_rate_offset_bps: number;
    }>`
      select id, name, city, province, active, portal_pin, referral_fee_bps, quote_rate_offset_bps
      from dealerships where id = ${data.dealerId} limit 1
    `;
    const d = rows[0];
    if (!d) return { ok: false as const };
    const pin = (d.portal_pin || "").trim() || DEALER_PIN();
    if (data.pin !== pin && data.pin !== ADMIN_PIN()) return { ok: false as const };
    return {
      ok: true as const,
      token: `dealer:${d.id}`,
      dealer: {
        id: d.id,
        name: d.name,
        referralFeeBps: Number(d.referral_fee_bps || 150),
        quoteRateOffsetBps: Number(d.quote_rate_offset_bps || 0),
        active: Boolean(d.active),
      },
    };
  });

export const getDealerPortal = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const dealerId = dealerIdFromToken(data.token);
    await ensurePortalSchema();
    const sql = await getSql();
    const dealers = await sql<{
      id: string;
      name: string;
      city: string;
      province: string;
      active: boolean;
      inventory_url: string;
      referral_fee_bps: number;
      quote_rate_offset_bps: number;
    }>`
      select id, name, city, province, active, inventory_url, referral_fee_bps, quote_rate_offset_bps
      from dealerships where id = ${dealerId} limit 1
    `;
    const d = dealers[0];
    if (!d) throw new Error("Dealer not found");

    const vehicles = await sql<{
      id: string;
      year: number;
      make: string;
      model: string;
      trim: string;
      price_cents: number;
      mileage: number;
      thumbnail_url: string;
      dealer_listing_url: string;
      vin: string;
      updated_at: string;
    }>`
      select id, year, make, model, trim, price_cents, mileage, thumbnail_url,
             dealer_listing_url, coalesce(vin, '') as vin, updated_at::text as updated_at
      from vehicles
      where dealership_id = ${dealerId} and status = 'active'
      order by price_cents desc
    `;

    return {
      dealer: {
        id: d.id,
        name: d.name,
        city: d.city,
        province: d.province,
        referralFeeBps: Number(d.referral_fee_bps || 150),
        quoteRateOffsetBps: Number(d.quote_rate_offset_bps || 0),
        active: Boolean(d.active),
        inventoryUrl: d.inventory_url,
      },
      vehicles: vehicles.map((v) => {
        const updatedAt = v.updated_at || "";
        return {
          id: v.id,
          title: vehicleDisplayTitle(v),
          year: Number(v.year),
          make: v.make,
          model: v.model,
          priceCents: Number(v.price_cents),
          mileage: Number(v.mileage),
          hasStudio: (v.thumbnail_url || "").startsWith("data:image/"),
          tileUrl: `/api/thumb/${encodeURIComponent(v.id)}?v=${encodeURIComponent(updatedAt)}`,
          listingUrl: v.dealer_listing_url || "",
          vin: v.vin || "",
        } satisfies DealerPortalVehicle;
      }),
      referrals: [] as {
        id: number;
        vehicle_label: string;
        customer_name: string;
        monthly_payment_cents: number;
        status: string;
        created_at: string;
      }[],
    };
  });

export const requestImageFix = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        vehicleId: z.string().min(1).max(160),
        note: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const dealerId = dealerIdFromToken(data.token);
    await ensurePortalSchema();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      year: number;
      make: string;
      model: string;
      trim: string;
      price_cents: number;
      mileage: number;
      vin: string;
      dealer_listing_url: string;
      thumbnail_source: string;
      dealer_name: string;
    }>`
      select v.id, v.year, v.make, v.model, v.trim, v.price_cents, v.mileage,
             coalesce(v.vin, '') as vin, v.dealer_listing_url,
             coalesce(v.thumbnail_source, '') as thumbnail_source,
             d.name as dealer_name
      from vehicles v
      join dealerships d on d.id = v.dealership_id
      where v.id = ${data.vehicleId} and v.dealership_id = ${dealerId} and v.status = 'active'
      limit 1
    `;
    const v = rows[0];
    if (!v) throw new Error("Vehicle not found");

    const recent = await sql<{ c: number }>`
      select count(*)::int as c from image_fix_requests
      where vehicle_id = ${v.id} and created_at > now() - interval '10 minutes'
    `;
    if (Number(recent[0]?.c || 0) > 0) {
      return { ok: true as const, emailed: false, throttled: true as const };
    }

    const title = vehicleDisplayTitle(v);
    const origin = palmettoOrigin();
    const adminUrl = `${origin}/admin?tab=renders&q=${encodeURIComponent(title)}`;
    const tileUrl = `${origin}/api/thumb/${encodeURIComponent(v.id)}`;
    const note = (data.note || "").trim();
    const to = await loadImageSupportEmail();

    const text = [
      `Image fix requested by ${v.dealer_name}`,
      ``,
      `Vehicle: ${title}`,
      `Price: ${formatCad(Number(v.price_cents))} · ${formatNumber(Number(v.mileage))} km`,
      v.vin ? `VIN: ${v.vin}` : `VIN: —`,
      `Vehicle ID: ${v.id}`,
      `Tile source: ${v.thumbnail_source || "unknown"}`,
      `Dealer listing: ${v.dealer_listing_url || "—"}`,
      `Current tile: ${tileUrl}`,
      ``,
      `Open admin (Renders, already filtered):`,
      adminUrl,
      ``,
      note ? `Dealer note:\n${note}` : `Dealer note: (none)`,
      ``,
      `Fix: Admin → Renders → search the title → Re-render or Render from uploads.`,
    ].join("\n");

    const html = `
      <p><strong>${v.dealer_name}</strong> requested an image fix.</p>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td>Vehicle</td><td><strong>${title}</strong></td></tr>
        <tr><td>Price / km</td><td>${formatCad(Number(v.price_cents))} · ${formatNumber(Number(v.mileage))} km</td></tr>
        <tr><td>VIN</td><td>${v.vin || "—"}</td></tr>
        <tr><td>Vehicle ID</td><td><code>${v.id}</code></td></tr>
        <tr><td>Tile source</td><td>${v.thumbnail_source || "unknown"}</td></tr>
        <tr><td>Dealer listing</td><td>${v.dealer_listing_url ? `<a href="${v.dealer_listing_url}">${v.dealer_listing_url}</a>` : "—"}</td></tr>
        <tr><td>Current tile</td><td><a href="${tileUrl}">${tileUrl}</a></td></tr>
      </table>
      <p><a href="${adminUrl}">Open Palmetto admin → Renders (filtered)</a></p>
      <p><img src="${tileUrl}" alt="${title}" width="320" style="max-width:100%;border-radius:12px;border:1px solid #ddd"/></p>
      ${note ? `<p><strong>Dealer note:</strong><br/>${escapeHtml(note)}</p>` : ""}
      <p style="color:#666;font-size:12px">Admin → Renders → search the title → Re-render or drop Front 3/4, Rear 3/4, Seats then Render from uploads.</p>
    `;

    const mailed = await sendMail({
      to,
      subject: `Image fix: ${title} (${v.dealer_name})`,
      text,
      html,
    });

    await sql`
      insert into image_fix_requests (dealership_id, vehicle_id, note, emailed_to, email_ok, email_error)
      values (
        ${dealerId},
        ${v.id},
        ${note},
        ${to},
        ${mailed.ok},
        ${mailed.ok ? "" : mailed.error || "send failed"}
      )
    `;

    if (!mailed.ok) {
      throw new Error(
        mailed.error || "Request saved, but the image-support email could not be sent",
      );
    }
    return { ok: true as const, emailed: true as const, throttled: false as const };
  });
