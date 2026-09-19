/**
 * Studio tile recipe — prompt must keep cars upright, three-quarters frame, paint from the photo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import jpeg from "jpeg-js";

const promptSrc = readFileSync(new URL("../src/lib/imagine/thumb-prompt.ts", import.meta.url), "utf8");
const fitSrc = readFileSync(new URL("../src/lib/imagine/normalize-tile.ts", import.meta.url), "utf8");

test("prompt rev is 14 and not a collage or half-frame toy", () => {
  assert.match(promptSrc, /STUDIO_PROMPT_REV = "14"/);
  assert.match(promptSrc, /Never invert/);
  assert.match(promptSrc, /three-quarters of the square/);
  assert.match(promptSrc, /BOTTOM edge/);
  assert.match(promptSrc, /Not a tiny toy/);
  assert.doesNotMatch(promptSrc, /contact sheet/i);
  assert.doesNotMatch(promptSrc, /about half the square/);
});

test("classics are not rewritten as current Ferraris", () => {
  assert.match(promptSrc, /Period-correct/);
  assert.match(promptSrc, /296\/Roma\/SF90/);
});

test("fit enlarges toys and does not letterbox a grey mat", () => {
  assert.doesNotMatch(fitSrc, /FIT_TRIGGER/);
  assert.match(fitSrc, /FIT_TARGET = 0\.74/);
  assert.match(fitSrc, /FIT_MIN = 0\.64/);
  assert.match(fitSrc, /zoomCrop/);
  assert.match(fitSrc, /sampleBilinear/);
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
  assert.match(gen, /firstExteriorDataUri/);
  assert.match(gen, /looksLikeCabinDataUri/);
  assert.match(cabin, /headliner/);
  assert.match(cabin, /top < 42/);
  assert.match(cabin, /mid > 80/);
  assert.match(gen, /impit/);
  assert.match(gen, /autoscout24/);
  assert.match(promptSrc, /never a Urus SUV/);
});

test("AutoScout listing-images stay bare — size crops 404", () => {
  const gallery = readFileSync(new URL("../src/lib/leasing/gallery.ts", import.meta.url), "utf8");
  const at = readFileSync(new URL("../src/lib/crawler/parse-autotrader.ts", import.meta.url), "utf8");
  const thumb = readFileSync(new URL("../src/routes/api/thumb.$id.ts", import.meta.url), "utf8");
  assert.match(gallery, /export function bareAutoscoutUrl/);
  assert.match(gallery, /if \(\/autoscout24\\.net\\\/listing-images\\\/\/i\.test\(out\)\) return out/);
  assert.match(at, /bareAutoscoutUrl\(decodeListingPhotoUrl/);
  assert.doesNotMatch(at, /replace\([^\n]*800x600/);
  assert.match(thumb, /bareAutoscoutUrl\(thumb\)/);

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

test("crawl paints one rooftop per pass and keeps Imagine skip flags", () => {
  const run = readFileSync(new URL("../src/lib/crawler/run.ts", import.meta.url), "utf8");
  const queue = readFileSync(new URL("../src/lib/imagine/queue.ts", import.meta.url), "utf8");
  const batch = readFileSync(new URL("../src/lib/imagine/batch-thumbs.ts", import.meta.url), "utf8");
  assert.match(queue, /export function pickOneDealerImagineBatch/);
  assert.match(queue, /export function mergeListingSpecs/);
  assert.match(run, /pickOneDealerImagineBatch/);
  assert.match(run, /mergeListingSpecs/);
  assert.match(run, /imagineSkip/);
  assert.doesNotMatch(run, /roundRobinByDealer/);
  assert.match(batch, /pickOneDealerImagineBatch/);

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
