import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { loadMailConfig, mailConfigured, sendMail } from "@/lib/mail/send";

export const DEFAULT_IMAGE_SUPPORT_EMAIL = "Jeremyp@paulmotorcompany.com";

export async function loadImageSupportEmail(): Promise<string> {
  const cfg = await loadMailConfig();
  return cfg.toDefault;
}

export const getImageSupportEmail = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ token: z.string().min(1) }).parse(input ?? { token: "" }),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    const cfg = await loadMailConfig();
    return {
      email: cfg.toDefault,
      smtpUser: cfg.smtpUser,
      smtpConfigured: mailConfigured(cfg),
      hasResend: Boolean(cfg.resendKey),
    };
  });

export const updateImageSupportEmail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        email: z.string().email().max(160),
        smtpUser: z.string().email().max(160).optional().or(z.literal("")),
        smtpPass: z.string().max(120).optional(),
        sendTest: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    await ensurePortalSchema();
    const sql = await getSql();
    const email = data.email.trim();
    await sql`
      insert into app_meta (key, value, updated_at)
      values ('image_support_email', ${email}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
    const smtpUser = (data.smtpUser || "").trim();
    if (smtpUser) {
      await sql`
        insert into app_meta (key, value, updated_at)
        values ('mail_smtp_user', ${smtpUser}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
    }
    const smtpPass = (data.smtpPass || "").trim();
    if (smtpPass) {
      await sql`
        insert into app_meta (key, value, updated_at)
        values ('mail_smtp_pass', ${smtpPass}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
    }

    let test: { ok: boolean; error?: string } | undefined;
    if (data.sendTest) {
      test = await sendMail({
        to: email,
        subject: "Palmetto image-fix mailer is working",
        text: [
          "This is a test from Palmetto Admin.",
          "Dealer “Request image fix” emails will arrive here.",
          "",
          "Admin → Renders is where you re-render the tile.",
        ].join("\n"),
      });
    }

    const cfg = await loadMailConfig();
    return {
      ok: true as const,
      email,
      smtpConfigured: mailConfigured(cfg),
      test,
    };
  });

export const listImageFixRequests = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    await ensurePortalSchema();
    const sql = await getSql();
    return sql<{
      id: number;
      vehicle_id: string;
      dealership_id: string;
      note: string;
      emailed_to: string;
      email_ok: boolean;
      email_error: string;
      created_at: string;
      title: string;
      dealer_name: string;
    }>`
      select r.id, r.vehicle_id, r.dealership_id, r.note, r.emailed_to, r.email_ok,
             r.email_error, r.created_at::text as created_at,
             coalesce(v.year::text || ' ' || v.make || ' ' || v.model, r.vehicle_id) as title,
             coalesce(d.name, r.dealership_id) as dealer_name
      from image_fix_requests r
      left join vehicles v on v.id = r.vehicle_id
      left join dealerships d on d.id = r.dealership_id
      order by r.id desc
      limit 20
    `;
  });
