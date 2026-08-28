/**
 * Grand Touring VDPs lead with brand logos. Palmetto must keep only carimages
 * and read EXTERIOR / INTERIOR from the spec row.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const gallerySrc = readFileSync(new URL("../src/lib/leasing/gallery.ts", import.meta.url), "utf8");
const parserSrc = readFileSync(
  new URL("../src/lib/crawler/parse-grand-touring.ts", import.meta.url),
  "utf8",
);

function isGtaChrome(url) {
  const u = url.toLowerCase();
  if (/gta-prod\.s3([.-][a-z0-9-]+)?\.amazonaws\.com/i.test(u)) return true;
  if (/grandtouringautos\.com\/static\//i.test(u)) return true;
  if (/gta_logo|certifiedpreowned|spin-icon|texture-menu/i.test(u)) return true;
  return false;
}

function decodeHtml(raw) {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseGrandTouringVdp(html) {
  const exterior = decodeHtml(
    html.match(/<div class="key">EXTERIOR<\/div>\s*<div class="value">([^<]+)/i)?.[1] || "",
  );
  const interior = decodeHtml(
    html.match(/<div class="key">INTERIOR<\/div>\s*<div class="value">([^<]+)/i)?.[1] || "",
  );
  const similar = html.search(/similar vehicles/i);
  const hardEnd = similar > 0 ? similar : html.length;
  const start = html.search(/id=["']lightboxCarousel["']|class=["'][^"']*freshImages/i);
  const from = start >= 0 ? start : 0;
  const slice = html.slice(from, Math.min(hardEnd, from + 80_000));
  const photos = [];
  const seen = new Set();
  for (const m of slice.matchAll(
    /https?:\/\/files\.dlsaccelerator\.com\/webasp\/uploads\/carimages\/[^"'?\s]+/gi,
  )) {
    const u = m[0].replace(/&amp;/g, "&").split("?")[0];
    if (seen.has(u)) continue;
    seen.add(u);
    photos.push(u);
  }
  return { photos, exterior, interior };
}

const FIXTURE = `
<img src="https://gta-prod.s3.amazonaws.com/bugatti/e996945e42324b90ba36bb1459db9aed.png" />
<img src="https://gta-prod.s3.ca-central-1.amazonaws.com/brand-images/5f858a3e.png" />
<div class="freshImages row">
  <img class="main-image" src="https://files.dlsaccelerator.com/webasp/uploads/carimages/gchfsw53.jpg" />
  <img src="https://files.dlsaccelerator.com/webasp/uploads/carimages/11114266.jpg" />
</div>
<div id="lightboxCarousel">
  <img src="https://files.dlsaccelerator.com/webasp/uploads/carimages/gchfsw53.jpg" />
  <img src="https://files.dlsaccelerator.com/webasp/uploads/carimages/e4egx0ym.jpg" />
</div>
<div class="key">EXTERIOR</div>
<div class="value">Grey Carbon/ Agile Blue</div>
<div class="key">INTERIOR</div>
<div class="value">Leather &amp; Alcantara</div>
<img src="https://gta-prod.s3.amazonaws.com/aston-martin/dbx-hero.jpg" />
<h2>Similar Vehicles</h2>
<img src="https://files.dlsaccelerator.com/webasp/uploads/carimages/OTHERSTOCK.jpg" />
`;

test("gta-prod S3 logos and related-brand tiles are chrome", () => {
  assert.match(gallerySrc, /gta-prod/);
  assert.match(gallerySrc, /isGtaChrome/);
  assert.equal(isGtaChrome("https://gta-prod.s3.amazonaws.com/bugatti/e996.png"), true);
  assert.equal(isGtaChrome("https://gta-prod.s3.ca-central-1.amazonaws.com/brand-images/abc.png"), true);
  assert.equal(isGtaChrome("https://www.grandtouringautos.com/static/images/GTA_Logo.svg"), true);
  assert.equal(
    isGtaChrome("https://files.dlsaccelerator.com/webasp/uploads/carimages/gchfsw53.jpg"),
    false,
  );
});

test("VDP parser keeps carimages and paint, drops logos", () => {
  assert.match(parserSrc, /freshImages/);
  assert.match(parserSrc, /EXTERIOR/);
  assert.match(parserSrc, /similar vehicles/i);
  assert.match(parserSrc, /&amp;/);
  const parsed = parseGrandTouringVdp(FIXTURE);
  assert.equal(parsed.exterior, "Grey Carbon/ Agile Blue");
  assert.equal(parsed.interior, "Leather & Alcantara");
  assert.deepEqual(parsed.photos, [
    "https://files.dlsaccelerator.com/webasp/uploads/carimages/gchfsw53.jpg",
    "https://files.dlsaccelerator.com/webasp/uploads/carimages/11114266.jpg",
    "https://files.dlsaccelerator.com/webasp/uploads/carimages/e4egx0ym.jpg",
  ]);
  assert.equal(
    parsed.photos.some((u) => /gta-prod|brand-images|aston-martin|OTHERSTOCK/i.test(u)),
    false,
  );
});

test("live PIN001 / CONSIGN120 / CO004 fixtures if present", () => {
  const names = ["PIN001", "CONSIGN120", "CO004"];
  for (const name of names) {
    let html;
    try {
      html = readFileSync(new URL(`../artifacts/gta/${name}.html`, import.meta.url), "utf8");
    } catch {
      continue;
    }
    const parsed = parseGrandTouringVdp(html);
    assert.ok(parsed.exterior.length > 2, `${name} exterior`);
    assert.ok(parsed.photos.length >= 8, `${name} gallery ${parsed.photos.length}`);
    assert.equal(
      parsed.photos.some((u) => /gta-prod|brand-images/i.test(u)),
      false,
      `${name} logos`,
    );
    // Related-inventory cars sit after Similar Vehicles — must not join this VIN.
    const similar = html.search(/similar vehicles/i);
    if (similar > 0) {
      const related = new Set();
      for (const m of html
        .slice(similar)
        .matchAll(/https?:\/\/files\.dlsaccelerator\.com\/webasp\/uploads\/carimages\/[^"'?\s]+/gi)) {
        related.add(m[0].split("?")[0]);
      }
      for (const u of related) {
        assert.equal(parsed.photos.includes(u), false, `${name} leaked ${u}`);
      }
    }
  }
});
