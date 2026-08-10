# Neon + inventory crawler (Palmetto)

Palmetto stores **live inventory** in **Neon Postgres** (separate from your CRM Neon project).

## 1. Create a Neon project (do not reuse CRM DB)

1. Open [console.neon.tech](https://console.neon.tech)
2. **New Project** → name it e.g. `palmetto-leasing`  
   (keep CRM on its own project)
3. Copy the **connection string** (pooled is fine for Vercel):  
   `postgresql://…@…neon.tech/neondb?sslmode=require`

## 2. Vercel env vars

**Project → palmetto-leasing → Settings → Environment Variables** (Production + Preview):

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon connection string |
| `CRON_SECRET` | long random secret (protects `/api/cron/crawl`) |
| `ADMIN_PIN` | your admin PIN |
| `PUBLIC_SITE_URL` | `https://palmettoleasing.com` |
| `VITE_PUBLIC_SITE_URL` | `https://palmettoleasing.com` |
| `VITE_PUBLIC_HOSTNAME` | `palmettoleasing.com` |
| `VITE_AUTH_ENABLED` | `false` |

Redeploy after saving.

On deploy, `npm run build` runs `db:migrate` and applies `migrations/*.sql` to Neon.

## 3. First pool

1. Open the live site → **Login → Admin** (PIN)
2. Click **Pool inventory now**
3. Confirm vehicle counts per dealer
4. Public home page should list active vehicles ≥ $150k CAD

## 4. Automatic crawl (every 12 hours)

`vercel.json` schedules:

```text
0 */12 * * *  →  /api/cron/crawl
```

Vercel Cron (Pro) calls that path. With `CRON_SECRET` set, requests must send:

```http
Authorization: Bearer <CRON_SECRET>
```

(Vercel Cron can be configured with that header in project settings, or pass `?secret=` for manual tests.)

## 5. How the crawler works

For each **active** dealership:

1. HTTP fetch of `inventory_url`
2. Parse JSON-LD / embedded inventory JSON / HTML price heuristics
3. Keep only **price ≥ $150,000 CAD**
4. Upsert into `vehicles`; mark missing ones `removed`
5. If the live site blocks bots or returns little data → **merge curated seed** so the funnel never goes empty

Improve accuracy over time by fixing each dealer’s **Inventory URL** in Admin to the best listing/search feed page.

## 6. Tables (inventory only)

- `dealerships` — partners, URLs, active flag  
- `vehicles` — pooled listings  
- `crawl_runs` / `crawl_events` — crawl history  
- `app_meta` — last crawl, pool version  

CRM leads stay in the **CRM** project via `CRM_HANDOFF_URL`.

## 7. Local / preview without Neon

If `DATABASE_URL` is unset, the app uses **PGLite** (embedded) so preview still works. Production should always set Neon.
