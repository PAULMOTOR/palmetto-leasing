/**
 * Admin dealer list for the marketing site — curated seed inventory (no DB).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEALERS, BASE_INVENTORY, ROTATING_ARRIVALS } from "@/lib/leasing/seed";

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

function counts() {
  const all = [...BASE_INVENTORY, ...ROTATING_ARRIVALS];
  const m = new Map<string, number>();
  for (const v of all) {
    m.set(v.dealership_id, (m.get(v.dealership_id) || 0) + 1);
  }
  return m;
}

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
    const c = counts();
    return DEALERS.map(
      (d): AdminDealer => ({
        id: d.id,
        name: d.name,
        city: d.city,
        province: d.province,
        brands: d.brands,
        website_url: d.website_url,
        inventory_url: d.inventory_url,
        active: d.active,
        vehicle_count: d.active ? c.get(d.id) || 0 : 0,
      }),
    );
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
    // Marketing site has no DB — dealer roster is edited in seed + redeploy.
    return {
      ok: false as const,
      message:
        "Dealership roster is curated in src/lib/leasing/seed.ts for this marketing deploy. Edit + redeploy (or later wire a CMS). URLs shown are current seed values.",
    };
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
    return {
      ok: false as const,
      message: "Add dealers in seed.ts and redeploy. No database on this marketing project.",
    };
  });
