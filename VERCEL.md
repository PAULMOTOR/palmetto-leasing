# Deploy Palmetto (palmettoleasing.com) on Vercel

Public **marketing** site for Paul Motor Leasing / Palmetto:

- Partner inventory + live lease calculator  
- Apply CTA → optional server handoff to a **separate CRM** Vercel project  
- **No Neon / Postgres** on this project  

CRM stays in its own repo and database. Do not import this app into the CRM project.

---

## 1. Import on Vercel

1. Push this repo to GitHub (private is fine).
2. [Vercel Dashboard](https://vercel.com/new) → **Add New… → Project** → **Import** the repo.
3. Framework preset: leave **auto** (TanStack Start / Vite + Nitro `vercel` preset).
4. **Build Command:** `npm run build`  
5. **Install Command:** `npm install`  
6. **Output:** handled by Nitro Vercel preset (do not set a static `dist` override).
7. Click **Deploy**.

After the first green deploy, attach the domain (section 3).

---

## 2. Environment variables

In **Vercel → Project → Settings → Environment Variables**, add for
Production (and Preview if you want):

| Name | Required | Example | Notes |
|------|----------|---------|--------|
| `PUBLIC_SITE_URL` | Yes | `https://palmettoleasing.com` | Canonical site URL |
| `VITE_PUBLIC_SITE_URL` | Recommended | `https://palmettoleasing.com` | Client-facing URL |
| `VITE_PUBLIC_HOSTNAME` | Recommended | `palmettoleasing.com` | OG / host helpers |
| `QUOTE_BASE_INTEREST_RATE` | Optional | `0.059` | Default APR (5.9%) |
| `QUOTE_TERM_MONTHS` | Optional | `36` | Default term |
| `QUOTE_RESIDUAL_RATE` | Optional | `0.5` | 50% residual |
| `QUOTE_DOWN_PAYMENT_RATE` | Optional | `0.2` | 20% down |
| `ADMIN_PIN` | Recommended | *(strong secret)* | Admin portal |
| `DEALER_PIN` | Optional | *(strong secret)* | Dealer portal demo PIN |
| `CRM_HANDOFF_URL` | When CRM ready | `https://your-crm.vercel.app/api/handoff/lease` | Server-only |
| `CRM_HANDOFF_SECRET` | When CRM ready | *(long random)* | **Never** `VITE_` prefix |
| `CRM_STATUS_URL` | Optional | `https://your-crm.vercel.app/api/status` | Client status lookup |
| `VITE_AUTH_ENABLED` | Optional | `false` | Marketing site default |

### Do **not** set on this project

- `DATABASE_URL` / Neon connection strings  
- CRM database credentials  
- Any secret that belongs only to the CRM app  

Redeploy after changing env vars.

---

## 3. Domain: palmettoleasing.com (GoDaddy → Vercel)

You own the domain at GoDaddy. Vercel does not need GoDaddy API access from code.

1. Vercel → Project → **Settings → Domains** → add `palmettoleasing.com` and `www.palmettoleasing.com`.
2. Vercel shows the exact DNS records. Typical patterns:

**Apex (`palmettoleasing.com`)** — one of:

- **A** record → `10.0.1.2` (Vercel’s common apex IP; **use the value Vercel displays**), or  
- **CNAME flattening** if GoDaddy shows that option for the apex  

**www**

- **CNAME** `www` → `cname.vercel-dns.com` (**or the host Vercel shows**)

3. In GoDaddy → **DNS** for `palmettoleasing.com`:
   - Remove conflicting A/CNAME records for `@` and `www`
   - Paste the records Vercel lists
   - Save (propagation often 5–30 minutes, sometimes longer)

4. Back in Vercel, wait until the domain shows **Valid**.

Optional: set the non-www → www (or reverse) redirect in Vercel Domains.

---

## 4. CRM handoff (later)

When the CRM project exposes an endpoint:

```http
POST {CRM_HANDOFF_URL}
Authorization: Bearer {CRM_HANDOFF_SECRET}
Content-Type: application/json
```

Body includes vehicle, quote math, customer fields, and `referenceId`.  
This site never opens the CRM database.

---

## 5. Local check before push

```bash
npm install
npm run typecheck
npm run build
```

Preview locally (optional):

```bash
npm run preview
```

---

## 6. What this site is / is not

| Is | Is not |
|----|--------|
| Public lease marketing + calculator | CRM system of record |
| Vercel serverless / Nitro deploy | Neon-backed inventory DB |
| Seeded partner catalog | Crawler writing to Postgres |
| Optional CRM HTTP handoff | Shared DB with CRM |
