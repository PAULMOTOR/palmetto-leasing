/**
 * Crop a white letterbox / inset frame if Imagine adds one, then enlarge
 * toys. Never letterbox a finished tile onto a grey mat — that resize is
 * what made the Bugatti look framed and jagged.
 */
import jpeg from "jpeg-js";

type Raster = { width: number; height: number; data: Uint8Array };

/** Occupancy below this gets zoomed in — the half-frame toys. */
export const FIT_MIN = 0.64;
/** Target occupancy after a zoom — matches the Palmetto camera plate. */
export const FIT_TARGET = 0.74;

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
      92,
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
  // Only crop a near-white frame (the 296 inset). Gray-to-edge studio stays.
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
 * Enlarge toys so they match the camera plate. Never shrink a clipper onto
 * a grey mat — that letterbox is a visible frame and a jaggy resize.
 */
export function fitCarInStudio(src: Raster): Raster {
  const w = src.width;
  const h = src.height;
  if (w < 64 || h < 64) return src;
  const occupancy = carOccupancy(src);
  if (occupancy < 0.28) return src;
  if (occupancy >= FIT_MIN) return src;
  const scale = Math.min(1.35, FIT_TARGET / occupancy);
  if (scale <= 1.04) return src;
  return zoomCrop(src, scale);
}

function zoomCrop(src: Raster, scale: number): Raster {
  const w = src.width;
  const h = src.height;
  const crop = 1 / scale;
  const cw = w * crop;
  const ch = h * crop;
  const ox = (w - cw) / 2;
  const oy = (h - ch) / 2;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const fy = oy + ((y + 0.5) / h) * ch - 0.5;
    for (let x = 0; x < w; x++) {
      const fx = ox + ((x + 0.5) / w) * cw - 0.5;
      sampleBilinear(src, fx, fy, out, (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data: out };
}

function sampleBilinear(src: Raster, fx: number, fy: number, out: Uint8Array, di: number): void {
  const w = src.width;
  const h = src.height;
  const x = Math.min(w - 1, Math.max(0, fx));
  const y = Math.min(h - 1, Math.max(0, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  const d = src.data;
  for (let c = 0; c < 3; c++) {
    const v0 = d[i00 + c]! * (1 - tx) + d[i10 + c]! * tx;
    const v1 = d[i01 + c]! * (1 - tx) + d[i11 + c]! * tx;
    out[di + c] = Math.round(v0 * (1 - ty) + v1 * ty);
  }
  out[di + 3] = 255;
}
