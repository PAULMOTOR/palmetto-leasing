/**
 * Admin Renders tab — list studio tiles and replace one at a time.
 * Never runs on page load; crawl only fills brand-new cars with no tile.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { generateVehicleThumbById } from "@/lib/imagine/batch-thumbs";
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { parsePhotos } from "@/lib/leasing/types";
import { listingPhotosInDealerOrder } from "@/lib/leasing/gallery";

export type AdminRenderRow = {
  id: string;
  title: string;
  dealerName: string;
  year: number;
  make: string;
  model: string;
  priceCents: number;
  mileage: number;
  hasStudio: boolean;
  inferred: boolean;
  hasListingPhoto: boolean;
  tileUrl: string;
  updatedAt: string;
};

export const listAdminRenders = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
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
      thumbnail_url: string;
      thumbnail_source: string;
      photo_urls: string;
      updated_at: string;
      dealer_name: string;
    }>`
      select v.id, v.year, v.make, v.model, v.trim, v.price_cents, v.mileage,
             v.thumbnail_url, coalesce(v.thumbnail_source, '') as thumbnail_source,
             v.photo_urls, v.updated_at::text as updated_at, d.name as dealer_name
      from vehicles v
      join dealerships d on d.id = v.dealership_id
      where v.status = 'active' and d.active = true
      order by v.price_cents desc
    `;
    return rows.map((r) => {
      const updatedAt = r.updated_at || "";
      const hasStudio = (r.thumbnail_url || "").startsWith("data:image/");
      const listingPhotos = listingPhotosInDealerOrder(parsePhotos(r.photo_urls || ""), 8);
      const hasListingPhoto = listingPhotos.length > 0 || /^https?:\/\//i.test(r.thumbnail_url || "");
      return {
        id: r.id,
        title: vehicleDisplayTitle(r),
        dealerName: r.dealer_name,
        year: Number(r.year),
        make: r.make,
        model: r.model,
        priceCents: Number(r.price_cents),
        mileage: Number(r.mileage),
        hasStudio,
        inferred: hasStudio && r.thumbnail_source === "inferred",
        hasListingPhoto,
        tileUrl: `/api/thumb/${encodeURIComponent(r.id)}?v=${encodeURIComponent(updatedAt)}`,
        updatedAt,
      } satisfies AdminRenderRow;
    });
  });

export const rerenderVehicleThumb = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ token: z.string().min(1), vehicleId: z.string().min(1).max(160) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    return generateVehicleThumbById(data.vehicleId);
  });
