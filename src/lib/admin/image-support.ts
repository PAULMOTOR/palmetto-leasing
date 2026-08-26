import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ensurePortalSchema } from "@/lib/db/ensure-portal-schema";

export const DEFAULT_IMAGE_SUPPORT_EMAIL = "Jeremyp@paulmotorcompany.com";

export async function loadImageSupportEmail(): Promise<string> {
  try {
    await ensurePortalSchema();
    const sql = await getSql();
    const rows = await sql<{ value: string }>`
      select value from app_meta where key = 'image_support_email' limit 1
    `;
    const v = rows[0]?.value?.trim();
    if (v && v.includes("@")) return v;
  } catch {
    /* default */
  }
  return process.env.IMAGE_SUPPORT_EMAIL?.trim() || DEFAULT_IMAGE_SUPPORT_EMAIL;
}

export const getImageSupportEmail = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ token: z.string().min(1) }).parse(input ?? { token: "" }),
  )
  .handler(async ({ data }) => {
    if (data.token !== "admin-ok") throw new Error("Unauthorized");
    return { email: await loadImageSupportEmail() };
  });

export const updateImageSupportEmail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        email: z.string().email().max(160),
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
    return { ok: true as const, email };
  });
