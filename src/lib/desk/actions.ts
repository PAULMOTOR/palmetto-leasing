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
  deleteDeskDeal,
  explodeVin,
  fetchDeskBoard,
  fetchDeskDeal,
  saveDeskQuote,
  sendCreditLink,
  startCrmDeal,
} from "@/lib/crm/partner";
import { assertDealerDesk } from "@/lib/desk/access";
import { attachHeroShots, creditAppMail, heroShotByVin } from "@/lib/desk/hero";

const tokenSlug = z.object({
  token: z.string().min(1),
  slug: z.string().min(1).max(64),
});

export const deskBoard = createServerFn({ method: "GET" })
  .validator((input: unknown) => tokenSlug.parse(input))
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    const board = await fetchDeskBoard(ctx.slug);
    board.deals = await attachHeroShots(board.deals, ctx.dealerId);
    let commission = { show: false, pct: 0 };
    let onboard = board.onboardingUrl || "";
    try {
      await ensurePortalSchema();
      const sql = await getSql();
      const rows = await sql<{
        show_commission: boolean;
        commission_pct: number | string;
        crm_onboard_url: string;
      }>`
        select coalesce(show_commission, false) as show_commission,
               coalesce(commission_pct, 0) as commission_pct,
               coalesce(crm_onboard_url, '') as crm_onboard_url
        from dealerships where id = ${ctx.dealerId} limit 1
      `;
      if (rows[0]) {
        commission = {
          show: Boolean(rows[0].show_commission),
          pct: Number(rows[0].commission_pct) || 0,
        };
        if (!onboard) onboard = rows[0].crm_onboard_url || "";
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
      onboardingUrl: onboard || undefined,
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
    const [withHero] = await attachHeroShots([deal], ctx.dealerId);
    return { deal: withHero, slug: ctx.slug, dealerName: ctx.name };
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
        firstName: z.string().min(1).max(60).optional(),
        lastName: z.string().min(1).max(60).optional(),
        email: z.string().email().max(160),
        phone: z.string().max(40).optional(),
        vin: z.string().length(17),
        year: z.number().int().min(1980).max(2100).nullable().optional(),
        make: z.string().max(60).optional(),
        model: z.string().max(80).optional(),
        trim: z.string().max(80).optional(),
        odometerKm: z.number().min(0).max(2_000_000),
        price: z.number().min(0).optional(),
        down: z.number().min(0).optional(),
        residual: z.number().min(0).optional(),
        term: z.number().min(0).optional(),
        monthly: z.number().min(0).optional(),
        rate: z.number().min(0).optional(),
        kmPerYear: z.number().min(0).optional(),
        emailQuote: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    let assignedRep = ctx.user
      ? { name: ctx.user.name, email: ctx.user.email, phone: ctx.user.phone }
      : { name: ctx.name, email: "", phone: "" };
    if (!ctx.user) {
      try {
        const sql = await getSql();
        const rows = await sql<{ contact_email: string; name: string }>`
          select name, coalesce(contact_email, '') as contact_email
          from dealerships where id = ${ctx.dealerId} limit 1
        `;
        if (rows[0]) {
          assignedRep = {
            name: rows[0].name || ctx.name,
            email: rows[0].contact_email || "",
            phone: "",
          };
        }
      } catch {
        /* rooftop name is enough */
      }
    }
    const contactName = assignedRep.name || ctx.name;
    const contactEmail = assignedRep.email;
    const contactPhone = assignedRep.phone;
    const heroUrl = await heroShotByVin(data.vin, {
      dealerId: ctx.dealerId,
      year: data.year,
      make: data.make,
      model: data.model,
    });
    const vehicleLabel = [data.year, data.make, data.model, data.trim].filter(Boolean).join(" ");
    const started = await startCrmDeal({
      dealer: ctx.slug,
      name: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
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
      assignedRep,
      image: heroUrl || undefined,
    });
    if (!started.ok || !started.id) return started;
    let mailed = false;
    let mailError: string | undefined;
    if (data.emailQuote) {
      const { sendMail } = await import("@/lib/mail/send");
      const mail = quoteMail({
        dealerName: ctx.name,
        contactName,
        contactEmail,
        contactPhone,
        vehicle: vehicleLabel || "your vehicle",
        lessee: data.name,
        price: data.price || 0,
        down: data.down || 0,
        residual: data.residual || 0,
        term: data.term || 0,
        monthly: data.monthly || 0,
        rate: data.rate || 0,
        heroUrl,
      });
      const sent = await sendMail({ to: data.email, ...mail });
      mailed = sent.ok;
      mailError = sent.error;
    }
    return { ...started, mailed, mailError, heroUrl };
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
    const link = await sendCreditLink(ctx.slug, data.id, data.email);
    if (!link.ok || !link.url || !data.email) return link;
    const deal = await fetchDeskDeal(ctx.slug, data.id);
    const [withHero] = deal ? await attachHeroShots([deal], ctx.dealerId) : [undefined];
    const { sendMail } = await import("@/lib/mail/send");
    const mail = creditAppMail({
      dealerName: ctx.name,
      contactName: ctx.user?.name || ctx.name,
      contactEmail: ctx.user?.email || "",
      contactPhone: ctx.user?.phone,
      vehicle: withHero?.vehicle || [withHero?.year, withHero?.make, withHero?.model].filter(Boolean).join(" "),
      creditUrl: link.url,
      heroUrl: withHero?.heroUrl,
    });
    const mailed = await sendMail({ to: data.email, ...mail });
    return { ...link, mailed: mailed.ok, mailError: mailed.error };
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

export const deskListPeople = createServerFn({ method: "GET" })
  .validator((input: unknown) => tokenSlug.parse(input))
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
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
      where dealership_id = ${ctx.dealerId}
      order by name
    `;
    return rows.map((r) => ({
      id: r.id,
      dealershipId: r.dealership_id,
      name: r.name,
      email: r.email,
      phone: r.phone || "",
      active: Boolean(r.active),
    }));
  });

export const deskUpsertPerson = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    tokenSlug
      .extend({
        name: z.string().min(1).max(120),
        email: z.string().email().max(160),
        phone: z.string().min(7).max(40),
        pin: z.string().min(4).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    await ensurePortalSchema();
    const sql = await getSql();
    const email = data.email.trim().toLowerCase();
    const id = `du_${ctx.dealerId}_${email.replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`;
    await sql`
      insert into dealer_users (id, dealership_id, name, email, phone, pin, active, updated_at)
      values (
        ${id},
        ${ctx.dealerId},
        ${data.name.trim()},
        ${email},
        ${data.phone.trim()},
        ${data.pin},
        true,
        now()
      )
      on conflict (id) do update set
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        pin = excluded.pin,
        active = true,
        updated_at = now()
    `;
    return { ok: true as const, id };
  });

export const deskRemovePerson = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    tokenSlug.extend({ id: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    await ensurePortalSchema();
    const sql = await getSql();
    await sql`
      delete from dealer_users
      where id = ${data.id} and dealership_id = ${ctx.dealerId}
    `;
    return { ok: true as const };
  });

export const deskDeleteDeal = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    tokenSlug.extend({ id: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const ctx = await assertDealerDesk(data.token, data.slug);
    const deal = await fetchDeskDeal(ctx.slug, data.id);
    if (!deal) return { ok: false as const, error: "Deal not found" };
    const { canDeleteDeal } = await import("@/lib/desk/stages");
    if (!canDeleteDeal(deal.bucket)) {
      return { ok: false as const, error: "Only quoted or lost quotes can be deleted" };
    }
    return deleteDeskDeal(ctx.slug, data.id);
  });

function quoteMail(opts: {
  dealerName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  vehicle: string;
  lessee: string;
  price: number;
  down: number;
  residual: number;
  term: number;
  monthly: number;
  rate: number;
  heroUrl?: string;
}): { subject: string; text: string; html: string } {
  const money = (n: number) =>
    n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
  const q = [opts.contactName, opts.contactEmail, opts.contactPhone].filter(Boolean).join(" · ");
  const hero = opts.heroUrl
    ? `<img src="${opts.heroUrl.startsWith("http") ? opts.heroUrl : `https://www.palmettoleasing.com${opts.heroUrl}`}" width="240" height="240" alt="" style="display:block;width:240px;height:240px;object-fit:cover;border-radius:16px"/>`
    : "";
  const lines = [
    `Price ${money(opts.price)}`,
    `Down ${money(opts.down)}`,
    `Residual ${money(opts.residual)}`,
    `Term ${opts.term} months`,
    `Rate ${opts.rate.toFixed(2)}%`,
    `Monthly ${opts.monthly.toLocaleString("en-CA", { style: "currency", currency: "CAD" })}`,
  ];
  return {
    subject: `Lease quote — ${opts.vehicle}`,
    text: `${opts.lessee}, ${opts.dealerName} prepared a Palmetto lease quote for ${opts.vehicle}.\n\n${lines.join("\n")}\n\n${q}`,
    html: `<div style="font-family:Georgia,serif;color:#1a1916;max-width:480px">${hero}<p>${opts.lessee}, ${opts.dealerName} prepared a Palmetto lease quote for <strong>${opts.vehicle}</strong>.</p><p>${lines.join("<br/>")}</p><p style="font-size:12px;color:#6b6560">${q}</p></div>`,
  };
}
