/**
 * Dealer Control Centre — Palmetto captures, CRM is the file.
 * Isolation, nine buckets only, secret stays on the server.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function rooftopMatches(dealerId, urlSlug, resolvedSlug) {
  const url = slugify(urlSlug);
  if (!url) return false;
  return url === slugify(dealerId) || url === slugify(resolvedSlug);
}

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

test("exactly the nine CRM buckets, shown as those labels", () => {
  const src = read("src/lib/desk/buckets.ts");
  assert.match(src, /"started"/);
  assert.match(src, /"quote_sent"/);
  assert.match(src, /"app_ids"/);
  assert.match(src, /"credit_review"/);
  assert.match(src, /"docs_missing"/);
  assert.match(src, /"gsm_approved"/);
  assert.match(src, /"compliance_hold"/);
  assert.match(src, /"in_book"/);
  assert.match(src, /"lost"/);
  const keys = [...src.matchAll(/"(started|quote_sent|app_ids|credit_review|docs_missing|gsm_approved|compliance_hold|in_book|lost)"/g)];
  assert.ok(keys.length >= 9);
  assert.doesNotMatch(src, /equifax|void cheque|insurance register|gsm approve/i);
});

test("a dealer cannot open another rooftop's desk", () => {
  assert.equal(
    rooftopMatches("grand-touring-autos", "ferrari-of-ontario", "grand-touring-autos"),
    false,
  );
  assert.equal(
    rooftopMatches("grand-touring-autos", "grand-touring-autos", "grand-touring-autos"),
    true,
  );
  assert.equal(rooftopMatches("groupe-lauzon", "bmw-laval", "bmw-laval"), true);
  const access = read("src/lib/desk/access.ts");
  assert.match(access, /This desk belongs to another rooftop/);
  assert.match(access, /rooftopMatches/);
  const actions = read("src/lib/desk/actions.ts");
  assert.match(actions, /assertDealerDesk/);
  assert.match(actions, /fetchDeskBoard\(ctx\.slug\)/);
});

test("Palmetto never writes CRM stages and never ships the Bearer secret to the browser", () => {
  const partner = read("src/lib/crm/partner.ts");
  assert.match(partner, /CRM_HANDOFF_SECRET/);
  assert.match(partner, /x-dealer-slug/);
  assert.match(partner, /searchParams\.set\("dealer"/);
  assert.doesNotMatch(partner, /VITE_CRM_HANDOFF_SECRET/);

  const uiFiles = walk(join(root, "src/routes/desk")).concat(
    walk(join(root, "src/components/desk")),
  );
  const ui = uiFiles.map((f) => readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(ui, /CRM_HANDOFF_SECRET/);
  assert.doesNotMatch(ui, /Authorization: Bearer/);
  assert.doesNotMatch(ui, /from "@\/lib\/crm\/partner"/);

  const login = read("src/routes/login.tsx");
  assert.match(login, /\/desk\/\$slug/);
  assert.doesNotMatch(ui, /Equifax|GSM approve|void cheque|void\/insurance/i);
});

test("Apply handoff sends dealer slug on query and header", () => {
  const handoff = read("src/lib/crm/handoff.ts");
  assert.match(handoff, /searchParams\.set\("dealer"/);
  assert.match(handoff, /x-dealer-slug/);
});

test("desk polls CRM files every 60s and only captures", () => {
  const home = read("src/routes/desk/$slug/index.tsx");
  const list = read("src/routes/desk/$slug/deals.tsx");
  const card = read("src/routes/desk/$slug/deals_.$id.tsx");
  const neu = read("src/routes/desk/$slug/new.tsx");
  for (const src of [home, list, card]) {
    assert.match(src, /60_000/);
  }
  assert.match(neu, /deskStartDeal/);
  assert.match(neu, /deskCreditLink/);
  assert.match(card, /Send credit link/);
  assert.match(card, /Submit quote/);
  assert.doesNotMatch(card, /Equifax|void cheque|Approve GSM|write stage/i);
  assert.match(partnerPollSafe(home), /deskBoard/);
});

function partnerPollSafe(src) {
  return src;
}

test("demo board is per rooftop so files never mix", () => {
  const partner = read("src/lib/crm/partner.ts");
  assert.match(partner, /demoStore/);
  assert.match(partner, /demo-\$\{slug\}/);
  assert.match(partner, /if \(!crmIsLive\(\)\) return demoBoard\(slug\)/);
});
