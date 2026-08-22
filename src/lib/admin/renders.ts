/**
 * Admin Renders tab — list studio tiles and replace one at a time.
 * Never runs on page load; crawl only fills brand-new cars with no tile.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { generateVehicleThumbById } from "@/lib/imagine/batch-thumbs";
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";

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
  tileUrl: string;
  updatedAt: string;
};

export const listAdminRenders = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
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
      updated_at: string;
      dealer_name: string;
    }>`
      select v.id, v.year, v.make, v.model, v.trim, v.price_cents, v.mileage,
             v.thumbnail_url, v.updated_at::text as updated_at, d.name as dealer_name
      from vehicles v
      join dealerships d on d.id = v.dealership_id
      where v.status = 'active' and d.active = true
      order by v.price_cents desc
    `;
    return rows.map((r) => {
      const updatedAt = r.updated_at || "";
      const hasStudio = (r.thumbnail_url || "").startsWith("data:image/");
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
