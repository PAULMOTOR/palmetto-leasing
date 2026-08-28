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

function parseGrandTouringVdp(html) {
  const decode = (raw) =>
    raw
      .replace(/&/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/"/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\s+/g, " ")
      .trim();
  const exterior = decode(
    html.match(/<div class="key">EXTERIOR<\/div>\s*<div class="value">([^<]+)/i)?.[1] || "",
  );
  const interior = decode(
    html.match(/<div class="key">INTERIOR<\/div>\s*<div class="value">([^<]+)/i)?.[1] || "",
  );
  const start = html.search(/id=["']lightboxCarousel["']|class=["'][^"']*freshImages/i);
  const slice = start >= 0 ? html.slice(start, start + 90_000) : html;
  const photos = [];
  const seen = new Set();
  for (const m of slice.matchAll(
    /https?:\/\/files\.dlsaccelerator\.com\/webasp\/uploads\/carimages\/[^"'?\s]+/gi,
  )) {
    const u = m[0].replace(/&/g, "&").split("?")[0];
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
<div class="value">Leather & Alcantara</div>
<img src="https://gta-prod.s3.amazonaws.com/aston-martin/dbx-hero.jpg" />
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
  const parsed = parseGrandTouringVdp(FIXTURE);
  assert.equal(parsed.exterior, "Grey Carbon/ Agile Blue");
  assert.equal(parsed.interior, "Leather & Alcantara");
  assert.deepEqual(parsed.photos, [
    "https://files.dlsaccelerator.com/webasp/uploads/carimages/gchfsw53.jpg",
    "https://files.dlsaccelerator.com/webasp/uploads/carimages/11114266.jpg",
    "https://files.dlsaccelerator.com/webasp/uploads/carimages/e4egx0ym.jpg",
  ]);
  assert.equal(
    parsed.photos.some((u) => /gta-prod|brand-images|aston-martin/i.test(u)),
    false,
  );
});
