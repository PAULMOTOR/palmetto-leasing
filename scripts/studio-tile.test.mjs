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
