/**
 * Outbound mail.
 * Order: Resend API key → Gmail/SMTP (env or Admin-saved app password).
 */
import nodemailer from "nodemailer";

export type MailConfig = {
  toDefault: string;
  resendKey: string;
  from: string;
  smtpUser: string;
  smtpPass: string;
  smtpHost: string;
  smtpPort: number;
};

const DEFAULT_TO = "Jeremyp@paulmotorcompany.com";

export async function loadMailConfig(): Promise<MailConfig> {
  const env: MailConfig = {
    toDefault: process.env.IMAGE_SUPPORT_EMAIL?.trim() || DEFAULT_TO,
    resendKey: process.env.RESEND_API_KEY?.trim() || "",
    from:
      process.env.RESEND_FROM?.trim() ||
      process.env.MAIL_FROM?.trim() ||
      "",
    smtpUser:
      process.env.GMAIL_USER?.trim() ||
      process.env.SMTP_USER?.trim() ||
      "",
    smtpPass:
      process.env.GMAIL_APP_PASSWORD?.trim() ||
      process.env.SMTP_PASS?.trim() ||
      "",
    smtpHost: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    smtpPort: Number(process.env.SMTP_PORT || 465) || 465,
  };
  try {
    const { getSql } = await import("@/lib/db");
    const { ensurePortalSchema } = await import("@/lib/db/ensure-portal-schema");
    await ensurePortalSchema();
    const sql = await getSql();
    const rows = await sql<{ key: string; value: string }>`
      select key, value from app_meta
      where key in (
        'image_support_email',
        'mail_resend_key',
        'mail_smtp_user',
        'mail_smtp_pass',
        'mail_from'
      )
    `;
    const map = Object.fromEntries(rows.map((r) => [r.key, (r.value || "").trim()]));
    if (map.image_support_email?.includes("@")) env.toDefault = map.image_support_email;
    if (map.mail_resend_key) env.resendKey = map.mail_resend_key;
    if (map.mail_smtp_user) env.smtpUser = map.mail_smtp_user;
    if (map.mail_smtp_pass) env.smtpPass = map.mail_smtp_pass;
    if (map.mail_from) env.from = map.mail_from;
  } catch {
    /* env only */
  }
  if (!env.from) {
    env.from = env.smtpUser
      ? `Palmetto Leasing <${env.smtpUser}>`
      : "Palmetto Leasing <noreply@palmettoleasing.com>";
  }
  return env;
}

export function mailConfigured(cfg: MailConfig): boolean {
  return Boolean(cfg.resendKey || (cfg.smtpUser && cfg.smtpPass));
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const cfg = await loadMailConfig();
  if (cfg.resendKey) {
    const r = await sendResend(cfg.resendKey, cfg.from, opts);
    if (r.ok) return r;
    if (cfg.smtpUser && cfg.smtpPass) {
      const s = await sendSmtp(cfg, opts);
      if (s.ok) return s;
      return { ok: false, error: `${r.error}; SMTP: ${s.error}` };
    }
    return r;
  }
  if (cfg.smtpUser && cfg.smtpPass) return sendSmtp(cfg, opts);
  return {
    ok: false,
    error: "Mail is not configured. Add a Gmail app password in Admin → Image / support email.",
  };
}

async function sendResend(
  key: string,
  from: string,
  opts: { to: string; subject: string; text: string; html?: string },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html || opts.text.replace(/\n/g, "<br/>"),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: body.message || `Resend HTTP ${res.status}` };
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendSmtp(
  cfg: MailConfig,
  opts: { to: string; subject: string; text: string; html?: string },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const transport = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpPort === 465,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });
    const info = await transport.sendMail({
      from: cfg.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html || opts.text.replace(/\n/g, "<br/>"),
    });
    return { ok: true, id: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
