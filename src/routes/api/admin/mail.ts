import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";
import { loadMailConfig, mailConfigured, sendMail } from "@/lib/mail/send";

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }
  if (request.method === "GET") {
    return Response.json({ ok: true, mail: "/api/admin/mail" });
  }
  let body: {
    token?: string;
    email?: string;
    smtpUser?: string;
    smtpPass?: string;
    sendTest?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.token !== "admin-ok") {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const email = String(body.email || "Jeremyp@paulmotorcompany.com").trim();
  const smtpUser = String(body.smtpUser || email).trim();
  const smtpPass = String(body.smtpPass || "").replace(/\s+/g, "");
  await ensurePortalSchema();
  const sql = await getSql();
  await sql`
    insert into app_meta (key, value, updated_at)
    values ('image_support_email', ${email}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  if (smtpUser) {
    await sql`
      insert into app_meta (key, value, updated_at)
      values ('mail_smtp_user', ${smtpUser}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
  }
  if (smtpPass) {
    await sql`
      insert into app_meta (key, value, updated_at)
      values ('mail_smtp_pass', ${smtpPass}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
  }

  let test: { ok: boolean; error?: string } | undefined;
  if (body.sendTest) {
    test = await sendMail({
      to: email,
      subject: "Palmetto image-fix mailer is working",
      text: "Dealer Request image fix emails will arrive here.\nAdmin → Renders to fix a tile.",
    });
  }
  const cfg = await loadMailConfig();
  return Response.json({
    ok: true,
    email,
    smtpConfigured: mailConfigured(cfg),
    test,
  });
}

export const Route = createFileRoute("/api/admin/mail")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
      OPTIONS: async ({ request }) => handle(request),
    },
  },
});
