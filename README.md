# Palmetto — Paul Motor Leasing

Public marketing site for **[palmettoleasing.com](https://palmettoleasing.com)**:

- Aggregated luxury inventory (curated partner feed)
- Live lease quote calculator (term / down / residual / APR)
- In-card **Apply** CTA with server-side handoff to a **separate CRM** project

**Stack:** React 19 · TanStack Start · Vite · Tailwind · Vercel (Nitro)

**Database:** Neon Postgres for inventory + crawler (`DATABASE_URL`). Keep CRM on a separate Neon project. See **NEON.md**.

CRM / leads / documents live in a separate Vercel app. Wire later with:

- `CRM_HANDOFF_URL`
- `CRM_HANDOFF_SECRET` (server-only)

## Quick start

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://0.0.0.0:8080 in the builder preview
npm run typecheck
npm run build
```

## Deploy

See **[VERCEL.md](./VERCEL.md)** for:

1. Vercel import steps  
2. Env vars to paste  
3. GoDaddy DNS for `palmettoleasing.com`

## Quote defaults

Configured via env (see `.env.example`):

| Variable | Default |
|----------|---------|
| `QUOTE_BASE_INTEREST_RATE` | `0.059` (5.9% APR) |
| `QUOTE_TERM_MONTHS` | `36` |
| `QUOTE_RESIDUAL_RATE` | `0.5` |
| `QUOTE_DOWN_PAYMENT_RATE` | `0.2` |

## Portals

| Login option | Purpose |
|--------------|---------|
| Client | Status via `CRM_STATUS_URL` when CRM exposes it |
| Dealer | Referral / rate offset UX (persist in CRM later) |
| Admin | Inventory roster view + quote env documentation |

Default demo PINs: `ADMIN_PIN=palmetto`, `DEALER_PIN=dealer` — change in production.

## Inventory

Partner vehicles are curated in `src/lib/leasing/seed.ts` (active dealerships + listings).  
No Neon crawler on this marketing deploy.

## Neon inventory

See [NEON.md](./NEON.md) — create a dedicated Neon project, set `DATABASE_URL` on Vercel, run Admin → **Pool inventory now**. Cron every 12h via `/api/cron/crawl`.
