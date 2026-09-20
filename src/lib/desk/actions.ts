/**
 * Dealer Control Centre — Palmetto server proxies CRM.
 * Bearer secret never reaches the browser. Palmetto does not write CRM stages.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";
import {
  explodeVin,
  fetchDeskBoard,
  fetchDeskDeal,
  saveDeskQuote,
  sendCreditLink,
  startCrmDeal,
} from "@/lib/crm/partner";
import { assertDealerDesk } from "@/lib/desk/access";

const tokenSlug = z.object({
  token: z.string().min(1),
  slug: z.string().min(1).max(64),
});

export const deskBoard = createServerFn({ method: "GET" })
  .validator((input: unknown) => tokenSlug.parse(input))
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    const board = await fetchDeskBoard(ctx.slug);
    let commission = { show: false, pct: 0 };
    try {
      await ensurePortalSchema();
      const sql = await getSql();
      const rows = await sql<{ show_commission: boolean; commission_pct: number | string }>`
        select coalesce(show_commission, false) as show_commission,
               coalesce(commission_pct, 0) as commission_pct
        from dealerships where id = ${ctx.dealerId} limit 1
      `;
      if (rows[0]) {
        commission = {
          show: Boolean(rows[0].show_commission),
          pct: Number(rows[0].commission_pct) || 0,
        };
      }
    } catch {
      /* preview without dealers table */
    }
    return {
      ...board,
      dealer: ctx.slug,
      dealerName: board.dealerName || ctx.name,
      slug: ctx.slug,
      user: ctx.user,
      commission,
    };
  });

export const deskDeal = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    tokenSlug.extend({ id: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    const deal = await fetchDeskDeal(ctx.slug, data.id);
    if (!deal) throw new Error("Deal not found");
    return { deal, slug: ctx.slug, dealerName: ctx.name };
  });

export const deskExplodeVin = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    tokenSlug.extend({ vin: z.string().min(8).max(24) }).parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    return explodeVin(ctx.slug, data.vin);
  });

export const deskStartDeal = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    tokenSlug
      .extend({
        name: z.string().min(1).max(120),
        email: z.string().email().max(160),
        phone: z.string().max(40).optional(),
        vin: z.string().length(17),
        year: z.number().int().min(1980).max(2100).nullable().optional(),
        make: z.string().max(60).optional(),
        model: z.string().max(80).optional(),
        trim: z.string().max(80).optional(),
        odometerKm: z.number().min(1).max(2_000_000),
        price: z.number().min(0).optional(),
        down: z.number().min(0).optional(),
        residual: z.number().min(0).optional(),
        term: z.number().min(0).optional(),
        monthly: z.number().min(0).optional(),
        rate: z.number().min(0).optional(),
        kmPerYear: z.number().min(0).optional(),
        sendCreditLink: z.boolean().optional(),
        application: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    if (!ctx.user) {
      return {
        ok: false as const,
        error: "Sign in with your email so this file is assigned to you — not a Palmetto sales rep.",
        live: false,
      };
    }
    const started = await startCrmDeal({
      dealer: ctx.slug,
      name: data.name,
      email: data.email,
      phone: data.phone,
      vin: data.vin,
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      odometerKm: data.odometerKm,
      price: data.price,
      down: data.down,
      residual: data.residual,
      term: data.term,
      monthly: data.monthly,
      rate: data.rate,
      kmPerYear: data.kmPerYear,
      application: data.application,
      assignedRep: {
        name: ctx.user.name,
        email: ctx.user.email,
        phone: ctx.user.phone,
      },
      sendCreditLink: data.sendCreditLink,
    });
    if (!started.ok || !started.id) return started;
    if (data.sendCreditLink) {
      const link = await sendCreditLink(ctx.slug, started.id, data.email);
      if (link.ok && link.url) {
        const { sendMail } = await import("@/lib/mail/send");
        const mailed = await sendMail({
          to: data.email,
          subject: `Credit application — ${[data.year, data.make, data.model].filter(Boolean).join(" ") || "Palmetto lease"}`,
          text: `${ctx.user.name} at ${ctx.name} sent you a Palmetto credit application.\n\n${link.url}\n\nQuestions: ${ctx.user.email}${ctx.user.phone ? ` · ${ctx.user.phone}` : ""}`,
          html: `<p>${ctx.user.name} at ${ctx.name} sent you a Palmetto credit application.</p><p><a href="${link.url}">Open credit app</a></p><p>Questions: ${ctx.user.email}${ctx.user.phone ? ` · ${ctx.user.phone}` : ""}</p>`,
        });
        return { ...started, creditUrl: link.url, mailed: mailed.ok, mailError: mailed.error };
      }
      return { ...started, creditUrl: link.url, mailed: false, mailError: link.error };
    }
    return started;
  });

export const deskCreditLink = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    tokenSlug
      .extend({
        id: z.string().min(1).max(120),
        email: z.string().email().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    return sendCreditLink(ctx.slug, data.id, data.email);
  });

export const deskSaveQuote = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    tokenSlug
      .extend({
        id: z.string().min(1).max(120),
        price: z.number().min(0),
        down: z.number().min(0),
        residual: z.number().min(0),
        term: z.number().min(0),
        monthly: z.number().min(0),
        rate: z.number().min(0),
        vin: z.string().max(24).optional(),
        year: z.number().int().min(1980).max(2100).nullable().optional(),
        make: z.string().max(60).optional(),
        model: z.string().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    return saveDeskQuote(ctx.slug, data.id, {
      price: data.price,
      down: data.down,
      residual: data.residual,
      term: data.term,
      monthly: data.monthly,
      rate: data.rate,
      vin: data.vin,
      year: data.year,
      make: data.make,
      model: data.model,
    });
  });

export const deskInventory = createServerFn({ method: "GET" })
  .validator((input: unknown) => tokenSlug.parse(input))
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    try {
      await ensurePortalSchema();
      const sql = await getSql();
      const rows = await sql<{
        id: string;
        year: number;
        make: string;
        model: string;
        trim: string;
        vin: string;
        price_cents: number;
        mileage: number;
      }>`
        select id, year, make, model, trim, coalesce(vin, '') as vin, price_cents, coalesce(mileage, 0) as mileage
        from vehicles
        where dealership_id = ${ctx.dealerId} and status = 'active'
        order by price_cents desc
        limit 80
      `;
      return {
        vehicles: rows.map((v) => ({
          id: v.id,
          title: vehicleDisplayTitle(v),
          vin: (v.vin || "").toUpperCase(),
          year: Number(v.year) || null,
          make: v.make || "",
          model: v.model || "",
          trim: v.trim || "",
          price: Math.round(Number(v.price_cents || 0) / 100),
          mileage: Number(v.mileage) || 0,
        })),
      };
    } catch {
      return { vehicles: [] as { id: string; title: string; vin: string; year: number | null; make: string; model: string; trim: string; price: number; mileage: number }[] };
    }
  });
