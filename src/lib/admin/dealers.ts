/**
 * Admin dealer management — backed by Neon/PGLite dealerships table.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { DEALERS } from "@/lib/leasing/seed";
import { ensureSeededInventory, runInventoryCrawl } from "@/lib/crawler/run";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";

export type AdminDealer = {
  id: string;
  name: string;
  city: string;
  province: string;
  brands: string;
  website_url: string;
  inventory_url: string;
  active: boolean;
  vehicle_count: number;
};

export const verifyAdminPin = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ pin: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const pin = process.env.ADMIN_PIN?.trim() || "palmetto";
    if (data.pin !== pin) return { ok: false as const };
    return { ok: true as const, token: "admin-ok" as const };
  });

export const listAdminDealers = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ token: z.string().min(1) }).parse(input ?? { token: "" }),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    try {
      await ensureSeededInventory();
      await ensurePortalSchema();
      const sql = await getSql();
      const rows = await sql<{
        id: string;
        name: string;
        city: string;
        province: string;
        brands: string;
        website_url: string;
        inventory_url: string;
        active: boolean;
        vehicle_count: number;
      }>`
        select d.*,
          (select count(*)::int from vehicles v where v.dealership_id = d.id and v.status = 'active') as vehicle_count
        from dealerships d
        order by d.name
      `;
      return rows.map((r) => ({
        ...r,
        active: Boolean(r.active),
        vehicle_count: Number(r.vehicle_count),
      }));
    } catch {
      return DEALERS.map((d) => ({
        id: d.id,
        name: d.name,
        city: d.city,
        province: d.province,
        brands: d.brands,
        website_url: d.website_url,
        inventory_url: d.inventory_url,
        active: d.active,
        vehicle_count: 0,
      }));
    }
  });

export const updateDealer = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        id: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        website_url: z.string().url().optional(),
        inventory_url: z.string().url().optional(),
        brands: z.string().max(200).optional(),
        city: z.string().max(80).optional(),
        province: z.string().max(8).optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    const sql = await getSql();
    const cur = await sql<{ id: string }>`select id from dealerships where id = ${data.id} limit 1`;
    if (!cur[0]) throw new Error("Dealer not found");

    await sql`
      update dealerships set
        name = coalesce(${data.name ?? null}, name),
        website_url = coalesce(${data.website_url ?? null}, website_url),
        inventory_url = coalesce(${data.inventory_url ?? null}, inventory_url),
        brands = coalesce(${data.brands ?? null}, brands),
        city = coalesce(${data.city ?? null}, city),
        province = coalesce(${data.province ?? null}, province),
        active = coalesce(${data.active ?? null}, active)
      where id = ${data.id}
    `;
    if (data.inventory_url || data.active === true) {
      try {
        await runInventoryCrawl({
          dealerIds: [data.id],
          generateThumbs: false,
        });
      } catch {
        /* listing will pick up on next full crawl */
      }
    }
    return { ok: true as const };
  });

export const deleteDealer = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        id: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    const sql = await getSql();
    const cur = await sql<{ id: string; name: string }>`
      select id, name from dealerships where id = ${data.id} limit 1
    `;
    if (!cur[0]) throw new Error("Dealer not found");

    // Soft-remove inventory, then drop dealer row
    await sql`
      update vehicles
      set status = 'removed', removed_at = now(), updated_at = now()
      where dealership_id = ${data.id}
    `;
    await sql`delete from dealerships where id = ${data.id}`;

    return { ok: true as const, id: data.id, name: cur[0].name };
  });

export const addDealer = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        name: z.string().min(2).max(120),
        city: z.string().min(1).max(80),
        province: z.string().min(1).max(8),
        brands: z.string().max(200).default(""),
        website_url: z.string().url(),
        inventory_url: z.string().url(),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    const id = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    const sql = await getSql();
    const inventoryUrl = normalizeInventoryUrl(data.inventory_url);
    await sql`
      insert into dealerships (id, name, city, province, brands, website_url, inventory_url, active)
      values (
        ${id}, ${data.name}, ${data.city}, ${data.province}, ${data.brands},
        ${data.website_url}, ${inventoryUrl}, ${data.active}
      )
      on conflict (id) do update set
        name = excluded.name,
        city = excluded.city,
        province = excluded.province,
        brands = excluded.brands,
        website_url = excluded.website_url,
        inventory_url = excluded.inventory_url,
        active = excluded.active
    `;
    let crawled = 0;
    try {
      const result = await runInventoryCrawl({
        dealerIds: [id],
        generateThumbs: false,
      });
      crawled = result.listingsFound;
    } catch {
      /* admin can click Pool inventory */
    }
    return { ok: true as const, id, crawled };
  });

function normalizeInventoryUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/leasesniper\.ca$/i.test(u.hostname.replace(/^www\./, ""))) {
      if (!/leaselisting|our-inventory/i.test(u.pathname)) {
        return "https://leasesniper.ca/our-inventory/";
      }
    }
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (host === "gclcars.ca" && path === "/") return "https://gclcars.ca/inventory";
    if (host === "ydautosales.com" && path === "/") return "https://ydautosales.com/cars";
    if (host === "revmotors.ca" && path === "/") return "https://www.revmotors.ca/used-inventory/";
    if (host === "gtamotorcars.com" && path === "/") return "https://www.gtamotorcars.com/inventory/";
    if (host === "farazautosalesltd.ca" && path === "/") return "https://www.farazautosalesltd.ca/vehicles/used/";
    if (host === "vfcautogroup.ca" && path === "/") return "https://www.vfcautogroup.ca/used-cars";
  } catch {
    /* keep as-is */
  }
  return url;
}
