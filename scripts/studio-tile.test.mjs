/**
 * Studio tile recipe — prompt must keep cars upright, three-quarters frame, paint from the photo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import jpeg from "jpeg-js";

const promptSrc = readFileSync(new URL("../src/lib/imagine/thumb-prompt.ts", import.meta.url), "utf8");
const fitSrc = readFileSync(new URL("../src/lib/imagine/normalize-tile.ts", import.meta.url), "utf8");

test("prompt rev is 16 with dark cabin and even floor", () => {
  assert.match(promptSrc, /STUDIO_PROMPT_REV = "16"/);
  assert.match(promptSrc, /Never invert/);
  assert.match(promptSrc, /two-thirds of the square/);
  assert.match(promptSrc, /BOTTOM edge/);
  assert.match(promptSrc, /Not a tiny toy/);
  assert.match(promptSrc, /never invent yellow/);
  assert.match(promptSrc, /even floor on all four sides/);
  assert.match(promptSrc, /never a tighter crop/);
  assert.doesNotMatch(promptSrc, /contact sheet/i);
  assert.doesNotMatch(promptSrc, /about half the square/);
});

test("classics are not rewritten as current Ferraris", () => {
  assert.match(promptSrc, /Period-correct/);
  assert.match(promptSrc, /296\/Roma\/SF90/);
});

test("fit enlarges toys and does not letterbox a grey mat", () => {
  assert.doesNotMatch(fitSrc, /FIT_TRIGGER/);
  assert.match(fitSrc, /FIT_TARGET = 0\.68/);
  assert.match(fitSrc, /FIT_MIN = 0\.55/);
  assert.match(fitSrc, /zoomCrop/);
  assert.match(fitSrc, /sampleBilinear/);
  assert.match(fitSrc, /centerCarInStudio/);
  assert.match(fitSrc, /Never letterbox/);
  assert.doesNotMatch(fitSrc, /shrinkOntoFloor/);
  const side = 64;
  const data = new Uint8Array(side * side * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 240;
    data[i + 1] = 240;
    data[i + 2] = 240;
    data[i + 3] = 255;
  }
  for (let y = 3; y < 61; y++) {
    for (let x = 3; x < 61; x++) {
      const i = (y * side + x) * 4;
      data[i] = 20;
      data[i + 1] = 20;
      data[i + 2] = 20;
    }
  }
  const encoded = jpeg.encode({ data, width: side, height: side }, 90);
  assert.ok(encoded.data.length > 100);
});


test("studio source skips cabin shots", () => {
  const gen = readFileSync(new URL("../src/lib/imagine/generate-thumb.ts", import.meta.url), "utf8");
  const cabin = readFileSync(new URL("../src/lib/imagine/cabin-detect.ts", import.meta.url), "utf8");
  assert.match(gen, /collectExteriorDataUris/);
  assert.match(gen, /looksLikeCabinDataUri/);
  assert.match(gen, /bytes < 12_000/);
  assert.match(gen, /paintFromSources/);
  assert.match(cabin, /headliner/);
  assert.match(cabin, /top < 42/);
  assert.match(cabin, /mid > 80/);
  assert.match(gen, /impit/);
  assert.match(gen, /autoscout24/);
  assert.match(promptSrc, /never a Urus SUV/);
  assert.match(promptSrc, /NEVER a Lamborghini Urus/);
  assert.match(promptSrc, /Copy Image 1's silhouette/);
  assert.match(promptSrc, /BOXY Mercedes G-Class/);
  assert.match(promptSrc, /never rounded SUV haunches/);
  assert.match(gen, /No actual dealer photography/);
});

test("AutoScout listing-images stay bare — size crops 404", () => {
  const gallery = readFileSync(new URL("../src/lib/leasing/gallery.ts", import.meta.url), "utf8");
  const at = readFileSync(new URL("../src/lib/crawler/parse-autotrader.ts", import.meta.url), "utf8");
  assert.match(gallery, /export function bareAutoscoutUrl/);
  assert.match(gallery, /if \(\/autoscout24\\.net\\\/listing-images\\\/\/i\.test\(out\)\) return out/);
  assert.match(at, /bareAutoscoutUrl\(decodeListingPhotoUrl/);
  assert.doesNotMatch(at, /replace\([^\n]*800x600/);

  function bareAutoscoutUrl(url) {
    if (!url || !/autoscout24\.net\/listing-images\//i.test(url)) return url;
    return url.replace(
      /(\/listing-images\/[0-9a-f-]+_[0-9a-f-]+\.(?:jpe?g|png|webp))\/\d+x\d+\.(?:jpe?g|png|webp)(\?.*)?$/i,
      "$1$2",
    );
  }
  const cropped =
    "https://prod.pictures.autoscout24.net/listing-images/a09d20c7-3be5-4bbe-b5c4-5fbb2c6c5b31_35763e4a-9616-4cf4-9373-7d78909e226b.jpg/800x600.webp";
  const hi =
    "https://prod.pictures.autoscout24.net/listing-images/a09d20c7-3be5-4bbe-b5c4-5fbb2c6c5b31_35763e4a-9616-4cf4-9373-7d78909e226b.jpg/1920x1080.webp";
  const bare =
    "https://prod.pictures.autoscout24.net/listing-images/a09d20c7-3be5-4bbe-b5c4-5fbb2c6c5b31_35763e4a-9616-4cf4-9373-7d78909e226b.jpg";
  assert.equal(bareAutoscoutUrl(cropped), bare);
  assert.equal(bareAutoscoutUrl(hi), bare);
  assert.equal(bareAutoscoutUrl(bare), bare);
  assert.equal(bareAutoscoutUrl("https://imagescdn.d2cmedia.ca/car.jpg"), "https://imagescdn.d2cmedia.ca/car.jpg");
});

test("D2C dealer thumbs upgrade mb/s8 to the full cbc photograph", () => {
  const gallery = readFileSync(new URL("../src/lib/leasing/gallery.ts", import.meta.url), "utf8");
  assert.match(gallery, /imagescdn\\.d2cmedia\\.ca\\\/\)\(\?:mb\|s8\)/);
  const mb =
    "https://imagescdn.d2cmedia.ca/mbc4e2fe9022931a12b8d42347715a351e/5000/13475827/1/Porsche-911-2025.jpg";
  const cbc = mb.replace("/mb", "/cbc");
  assert.equal(
    mb.replace(/(imagescdn\.d2cmedia\.ca\/)(?:mb|s8)([0-9a-f]+)/i, "$1cbc$2"),
    cbc,
  );
});

test("crawl paints one rooftop per pass and keeps Imagine skip flags", () => {
  const run = readFileSync(new URL("../src/lib/crawler/run.ts", import.meta.url), "utf8");
  const queue = readFileSync(new URL("../src/lib/imagine/queue.ts", import.meta.url), "utf8");
  const batch = readFileSync(new URL("../src/lib/imagine/batch-thumbs.ts", import.meta.url), "utf8");
  assert.match(queue, /export function pickOneDealerImagineBatch/);
  assert.match(queue, /export function mergeListingSpecs/);
  assert.match(run, /pickOneDealerImagineBatch/);
  assert.match(run, /mergeListingSpecs/);
  assert.match(run, /imagineSkip/);
  assert.match(run, /resetSkip: photosChanged/);
  assert.match(run, /mergeLiveGallery/);
  assert.doesNotMatch(run, /roundRobinByDealer/);
  assert.match(batch, /pickOneDealerImagineBatch/);
  assert.match(batch, /mergeLiveGallery/);
  assert.match(queue, /opts\?\.resetSkip/);

  function mergeListingSpecs(previous, incoming, opts) {
    const next = { ...(incoming || {}) };
    const prev = previous || {};
    for (const key of ["imagineRev", "imagineQa", "imagineQaFails", "imagineSkip"]) {
      if (opts?.resetSkip && (key === "imagineSkip" || key === "imagineQaFails")) continue;
      if (prev[key]) next[key] = prev[key];
    }
    return next;
  }
  const kept = mergeListingSpecs({ imagineSkip: "1", imagineRev: "15" }, { source: "live" });
  assert.equal(kept.imagineSkip, "1");
  const reset = mergeListingSpecs({ imagineSkip: "1", imagineRev: "15" }, { source: "live" }, { resetSkip: true });
  assert.equal(reset.imagineSkip, undefined);
  assert.equal(reset.imagineRev, "15");

  function pickOneDealerImagineBatch(rows, limit, preferDealer) {
    const queues = new Map();
    for (const row of rows) {
      const list = queues.get(row.dealership_id) || [];
      list.push(row);
      queues.set(row.dealership_id, list);
    }
    if (!queues.size) return [];
    const keys = [...queues.keys()].sort();
    let dealer = keys[0];
    const prefer = (preferDealer || "").trim();
    if (prefer && (queues.get(prefer)?.length || 0) > 0) dealer = prefer;
    else if (prefer) dealer = keys.find((k) => k > prefer) || keys[0];
    return (queues.get(dealer) || []).slice(0, limit);
  }
  const rows = [
    { dealership_id: "vfc-auto", id: "v1" },
    { dealership_id: "vfc-auto", id: "v2" },
    { dealership_id: "mclaren-of-toronto", id: "m1" },
    { dealership_id: "mclaren-of-toronto", id: "m2" },
    { dealership_id: "mclaren-of-toronto", id: "m3" },
    { dealership_id: "mclaren-of-toronto", id: "m4" },
  ];
  const a = pickOneDealerImagineBatch(rows, 3);
  assert.equal(a.length, 3);
  assert.ok(a.every((r) => r.dealership_id === "mclaren-of-toronto"));
  const b = pickOneDealerImagineBatch(rows, 3, "mclaren-of-toronto");
  assert.ok(b.every((r) => r.dealership_id === "mclaren-of-toronto"));
  const c = pickOneDealerImagineBatch(rows.filter((r) => r.dealership_id !== "mclaren-of-toronto"), 3, "mclaren-of-toronto");
  assert.ok(c.every((r) => r.dealership_id === "vfc-auto"));
});

test("shopper grid only shows photographed Palmetto tiles", () => {
  const queries = readFileSync(new URL("../src/lib/leasing/queries.ts", import.meta.url), "utf8");
  const card = readFileSync(new URL("../src/components/inventory/vehicle-card.tsx", import.meta.url), "utf8");
  const thumb = readFileSync(new URL("../src/routes/api/thumb.$id.ts", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/lib/imagine/thumb-source.ts", import.meta.url), "utf8");
  const qa = readFileSync(new URL("../src/lib/imagine/tile-qa.ts", import.meta.url), "utf8");
  assert.match(source, /export function isPhotographedStudioTile/);
  assert.match(queries, /rowOnShopperGrid/);
  assert.match(queries, /isPhotographedStudioTile/);
  assert.doesNotMatch(card, /top-porsche-911/);
  assert.doesNotMatch(card, /\.\.\.\(vehicle\.photos/);
  assert.match(thumb, /status: 404/);
  assert.doesNotMatch(thumb, /top-porsche-911/);
  assert.doesNotMatch(thumb, /redirectTo/);
  assert.match(qa, /qa-unavailable/);
  assert.doesNotMatch(qa, /return accept;/);
});

test("Renders tab only lists live listings and rotates a dead-URL sweep", () => {
  const renders = readFileSync(new URL("../src/lib/admin/renders.ts", import.meta.url), "utf8");
  const dead = readFileSync(new URL("../src/lib/crawler/dead-listings.ts", import.meta.url), "utf8");
  const cron = readFileSync(new URL("../src/routes/api/cron/sweep.ts", import.meta.url), "utf8");
  const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(renders, /dealer_listing_url like 'http%'/);
  assert.match(renders, /interval '7 days'/);
  assert.match(renders, /sweepDeadListings/);
  assert.match(dead, /listing_checked_at/);
  assert.match(dead, /listingProbeLooksDead/);
  assert.match(cron, /sweepDeadListings/);
  assert.match(vercel, /\/api\/cron\/sweep/);
});

test("dealer control centre has no inventory link and assigns the signed-in employee", () => {
  const shell = readFileSync(new URL("../src/components/desk/shell.tsx", import.meta.url), "utf8");
  const partner = readFileSync(new URL("../src/lib/crm/partner.ts", import.meta.url), "utf8");
  const access = readFileSync(new URL("../src/lib/desk/access.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../src/lib/db/ensure-portal-schema.ts", import.meta.url), "utf8");
  const neu = readFileSync(new URL("../src/routes/desk/$slug/new.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /to="\/"/);
  assert.doesNotMatch(shell, />Inventory</);
  assert.match(shell, /Sign out/);
  assert.match(partner, /assignPaulMotorRep: false/);
  assert.match(partner, /stage: "quoted"/);
  assert.match(partner, /kind: "dealer_user"/);
  assert.match(access, /user: DealerUser/);
  assert.match(schema, /dealer_users/);
  assert.match(neu, /Kilometres/);
  assert.match(neu, /Submit to credit/);
  assert.match(neu, /Lessee fills out here/);
  assert.match(neu, /From your Palmetto inventory/);
  assert.match(neu, /DESK_MIN_APR/);
  assert.match(neu, /Your commission/);
  const calc = readFileSync(new URL("../src/lib/leasing/calc.ts", import.meta.url), "utf8");
  assert.match(calc, /DESK_MIN_APR = 0\.0599/);
  assert.match(calc, /DESK_MIN_DOWN_RATE = 0\.05/);
  const adminDealers = readFileSync(new URL("../src/lib/admin/dealers.ts", import.meta.url), "utf8");
  assert.match(adminDealers, /show_commission/);
  assert.match(adminDealers, /commission_pct/);
});
