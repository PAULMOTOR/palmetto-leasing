/**
 * Force Imagine tiles to Palmetto canvas rules:
 *  - no white letterbox / inset frame
 *  - floor is #FFFFFF to every edge (dealer gray cycloramas get remapped)
 *  - leave the car and a soft contact shadow alone
 */
import jpeg from "jpeg-js";

type Raster = { width: number; height: number; data: Uint8Array };

export function normalizeStudioTileDataUri(dataUri: string): string | null {
  if (!dataUri.startsWith("data:image/jpeg") && !dataUri.startsWith("data:image/jpg")) {
    return null;
  }
  const comma = dataUri.indexOf(",");
  if (comma < 0) return null;
  try {
    const buf = Buffer.from(dataUri.slice(comma + 1), "base64");
    const decoded = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 64 });
    if (!decoded?.data || decoded.width < 64 || decoded.height < 64) return null;
    const raster: Raster = {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data as Uint8Array,
    };
    const cropped = cropUniformBorder(raster);
    whitenStudioFloor(cropped);
    const encoded = jpeg.encode(
      { data: cropped.data, width: cropped.width, height: cropped.height },
      90,
    );
    if (!encoded?.data?.length) return null;
    const out = `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
    if (out.length > 950_000) return null;
    return out;
  } catch {
    return null;
  }
}

function lum(data: Uint8Array, i: number): number {
  return (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
}

function chroma(data: Uint8Array, i: number): number {
  const r = data[i]!;
  const g = data[i + 1]!;
  const b = data[i + 2]!;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function cropUniformBorder(src: Raster): Raster {
  const { width: w, height: h, data } = src;
  const edge = lum(data, 0);
  // Only crop a near-white frame (the 296 inset). Gray-to-edge tiles stay.
  if (edge < 245) return src;

  const isFrame = (i: number) => lum(data, i) >= 248 && chroma(data, i) < 12;

  const rowIsFrame = (y: number) => {
    let n = 0;
    const total = Math.ceil(w / 8);
    for (let x = 0; x < w; x += 8) {
      if (isFrame((y * w + x) * 4)) n += 1;
    }
    return n / total > 0.92;
  };
  const colIsFrame = (x: number) => {
    let n = 0;
    const total = Math.ceil(h / 8);
    for (let y = 0; y < h; y += 8) {
      if (isFrame((y * w + x) * 4)) n += 1;
    }
    return n / total > 0.92;
  };

  let top = 0;
  let bot = h - 1;
  let left = 0;
  let right = w - 1;
  while (top < h * 0.22 && rowIsFrame(top)) top += 1;
  while (bot > h * 0.78 && rowIsFrame(bot)) bot -= 1;
  while (left < w * 0.22 && colIsFrame(left)) left += 1;
  while (right > w * 0.78 && colIsFrame(right)) right -= 1;

  const cw = right - left + 1;
  const ch = bot - top + 1;
  if (cw < w * 0.72 || ch < h * 0.72) return src;
  if (top < 8 && left < 8) return src;

  const side = Math.min(cw, ch);
  const ox = left + Math.floor((cw - side) / 2);
  const oy = top + Math.floor((ch - side) / 2);
  const out = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const si = ((oy + y) * w + (ox + x)) * 4;
      const di = (y * side + x) * 4;
      out[di] = data[si]!;
      out[di + 1] = data[si + 1]!;
      out[di + 2] = data[si + 2]!;
      out[di + 3] = 255;
    }
  }
  return { width: side, height: side, data: out };
}

function whitenStudioFloor(img: Raster): void {
  const { width: w, height: h, data } = img;
  const samples: number[] = [];
  const probe = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (chroma(data, i) < 14) samples.push(lum(data, i));
  };
  for (let i = 0; i < 24; i++) {
    probe(i, i);
    probe(w - 1 - i, i);
    probe(i, h - 1 - i);
    probe(w - 1 - i, h - 1 - i);
    probe(Math.floor(w / 2), i);
    probe(i, Math.floor(h / 2));
  }
  if (!samples.length) return;
  samples.sort((a, b) => a - b);
  const floorL = samples[Math.floor(samples.length / 2)]!;
  // White already — nothing to do. Too dark to be a studio cyclorama — skip.
  if (floorL > 248 || floorL < 190) return;

  const lo = floorL - 18;
  for (let i = 0; i < data.length; i += 4) {
    if (chroma(data, i) >= 16) continue;
    const L = lum(data, i);
    if (L >= lo && L <= 255) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
}
