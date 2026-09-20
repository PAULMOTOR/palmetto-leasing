/**
 * Individual rooftop employees. The signed-in person is the CRM assignee —
 * never a Paul Motor sales rep.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { resolveDealerSlug } from "@/lib/crm/dealers";

export type DealerUser = {
  id: string;
  dealershipId: string;
  name: string;
  email: string;
  phone: string;
  active: boolean;
};

export function parseDealerToken(token: string): { dealerId: string; userId?: string } {
  if (!token.startsWith("dealer:")) throw new Error("Sign in as a dealer");
  const rest = token.slice("dealer:".length).trim();
  if (!rest) throw new Error("Sign in as a dealer");
  const idx = rest.indexOf(":u:");
  if (idx > 0) {
    return { dealerId: rest.slice(0, idx), userId: rest.slice(idx + 3) };
  }
  return { dealerId: rest };
}

export function dealerUserToken(dealerId: string, userId: string): string {
  return `dealer:${dealerId}:u:${userId}`;
}

export async function loadDealerUser(userId: string): Promise<DealerUser | null> {
  await ensurePortalSchema();
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    dealership_id: string;
    name: string;
    email: string;
    phone: string;
    active: boolean;
  }>`
    select id, dealership_id, name, email, phone, active
    from dealer_users
    where id = ${userId}
    limit 1
  `;
  const r = rows[0];
  if (!r || !r.active) return null;
  return {
    id: r.id,
    dealershipId: r.dealership_id,
    name: r.name,
    email: r.email,
    phone: r.phone || "",
    active: Boolean(r.active),
  };
}

export async function findDealerUserByEmail(
  email: string,
): Promise<(DealerUser & { pin: string; dealerName: string }) | null> {
  await ensurePortalSchema();
  const sql = await getSql();
  const key = email.trim().toLowerCase();
  if (!key.includes("@")) return null;
  const rows = await sql<{
    id: string;
    dealership_id: string;
    name: string;
    email: string;
    phone: string;
    pin: string;
    active: boolean;
    dealer_name: string;
  }>`
    select u.id, u.dealership_id, u.name, u.email, u.phone, u.pin, u.active, d.name as dealer_name
    from dealer_users u
    join dealerships d on d.id = u.dealership_id
    where lower(u.email) = ${key} and u.active = true and d.active = true
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    dealershipId: r.dealership_id,
    name: r.name,
    email: r.email,
    phone: r.phone || "",
    active: true,
    pin: r.pin,
    dealerName: r.dealer_name,
  };
}

export const listDealerUsers = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ token: z.string().min(1), dealerId: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    await ensurePortalSchema();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      dealership_id: string;
      name: string;
      email: string;
      phone: string;
      active: boolean;
    }>`
      select id, dealership_id, name, email, phone, active
      from dealer_users
      where dealership_id = ${data.dealerId}
      order by name
    `;
    return rows.map((r) => ({
      id: r.id,
      dealershipId: r.dealership_id,
      name: r.name,
      email: r.email,
      phone: r.phone || "",
      active: Boolean(r.active),
    })) satisfies DealerUser[];
  });

export const upsertDealerUser = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        dealerId: z.string().min(1).max(64),
        id: z.string().max(80).optional(),
        name: z.string().min(1).max(120),
        email: z.string().email().max(160),
        phone: z.string().min(7).max(40),
        pin: z.string().min(4).max(64).optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    await ensurePortalSchema();
    const sql = await getSql();
    const dealer = await sql<{ id: string }>`
      select id from dealerships where id = ${data.dealerId} limit 1
    `;
    if (!dealer[0]) throw new Error("Dealer not found");
    const email = data.email.trim().toLowerCase();
    const id =
      data.id?.trim() ||
      `du_${data.dealerId}_${email.replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`;
    if (!data.id && !data.pin) throw new Error("PIN is required for a new person");
    await sql`
      insert into dealer_users (id, dealership_id, name, email, phone, pin, active, updated_at)
      values (
        ${id},
        ${data.dealerId},
        ${data.name.trim()},
        ${email},
        ${data.phone.trim()},
        ${data.pin || ""},
        ${data.active ?? true},
        now()
      )
      on conflict (id) do update set
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        pin = case when excluded.pin <> '' then excluded.pin else dealer_users.pin end,
        active = excluded.active,
        updated_at = now()
    `;
    return { ok: true as const, id };
  });

export async function dealerSlugForId(id: string, name: string): Promise<string> {
  return (await resolveDealerSlug({ localSlug: id, localName: name })) || id;
}
