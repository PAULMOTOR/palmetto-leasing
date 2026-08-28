/**
 * Crop a white letterbox / inset frame if Imagine adds one, then shrink the car
 * if it still fills the square. Does not recolor the floor.
 */
import jpeg from "jpeg-js";

type Raster = { width: number; height: number; data: Uint8Array };

/** Occupancy above this (bbox / side) gets scaled down. */
export const FIT_TRIGGER = 0.72;
/** Target occupancy after a shrink — matches the Palmetto camera plate. */
export const FIT_TARGET = 0.56;

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
    let raster: Raster = {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data as Uint8Array,
    };
    raster = cropUniformBorder(raster);
    raster = fitCarInStudio(raster);
    const encoded = jpeg.encode(
      { data: raster.data, width: raster.width, height: raster.height },
      88,
    );
    if (!encoded?.data?.length) return null;
    const out = `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
    if (out.length > 400_000) return null;
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

function cornerFloor(src: Raster): { r: number; g: number; b: number; lum: number } {
  const { width: w, height: h, data } = src;
  const patch = 10;
  const points = [
    [0, 0],
    [w - patch, 0],
    [0, h - patch],
    [w - patch, h - patch],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [x0, y0] of points) {
    for (let y = y0; y < y0 + patch; y += 2) {
      for (let x = x0; x < x0 + patch; x += 2) {
        const i = (y * w + x) * 4;
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
        n += 1;
      }
    }
  }
  r = Math.round(r / n);
  g = Math.round(g / n);
  b = Math.round(b / n);
  return { r, g, b, lum: (r * 299 + g * 587 + b * 114) / 1000 };
}

/** Fraction of the square occupied by the car's axis-aligned bbox. */
export function carOccupancy(src: Raster): number {
  const floor = cornerFloor(src);
  const { width: w, height: h, data } = src;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const L = lum(data, i);
      const C = chroma(data, i);
      if (C < 28 && L > floor.lum - 40) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) return 0;
  return Math.max(maxX - minX, maxY - minY) / Math.min(w, h);
}

/**
 * If the car fills the tile, scale the whole frame down onto more studio floor
 * so bumpers stop clipping. No-op when occupancy is already in range.
 */
export function fitCarInStudio(src: Raster): Raster {
  const w = src.width;
  const h = src.height;
  if (w < 64 || h < 64) return src;
  const occupancy = carOccupancy(src);
  if (occupancy < 0.2 || occupancy <= FIT_TRIGGER) return src;
  const scale = Math.min(0.92, FIT_TARGET / occupancy);
  if (scale >= 0.97) return src;
  const floor = cornerFloor(src);
  const nw = Math.max(32, Math.round(w * scale));
  const nh = Math.max(32, Math.round(h * scale));
  const ox = Math.floor((w - nw) / 2);
  const oy = Math.floor((h - nh) / 2);
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = floor.r;
    out[i + 1] = floor.g;
    out[i + 2] = floor.b;
    out[i + 3] = 255;
  }
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor((y / nh) * h));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor((x / nw) * w));
      const si = (sy * w + sx) * 4;
      const di = ((oy + y) * w + (ox + x)) * 4;
      out[di] = src.data[si]!;
      out[di + 1] = src.data[si + 1]!;
      out[di + 2] = src.data[si + 2]!;
      out[di + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}
