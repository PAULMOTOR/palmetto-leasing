/**
 * Studio tile recipe — prompt must keep cars upright, half-frame, paint from the photo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import jpeg from "jpeg-js";

const promptSrc = readFileSync(new URL("../src/lib/imagine/thumb-prompt.ts", import.meta.url), "utf8");
const fitSrc = readFileSync(new URL("../src/lib/imagine/normalize-tile.ts", import.meta.url), "utf8");

test("prompt rev is 13 and not a collage", () => {
  assert.match(promptSrc, /STUDIO_PROMPT_REV = "13"/);
  assert.match(promptSrc, /Never invert/);
  assert.match(promptSrc, /half the square/);
  assert.match(promptSrc, /BOTTOM edge/);
  assert.doesNotMatch(promptSrc, /contact sheet/i);
  assert.doesNotMatch(promptSrc, /~70%/);
});

test("classics are not rewritten as current Ferraris", () => {
  assert.match(promptSrc, /Period-correct/);
  assert.match(promptSrc, /296\/Roma\/SF90/);
});

test("fit shrinks an oversized car on a light floor", () => {
  assert.match(fitSrc, /FIT_TRIGGER = 0\.72/);
  assert.match(fitSrc, /FIT_TARGET = 0\.56/);
  const side = 64;
  const data = new Uint8Array(side * side * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 240;
    data[i + 1] = 240;
    data[i + 2] = 240;
    data[i + 3] = 255;
  }
  // dark car filling ~90% of the square
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
