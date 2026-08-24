/**
 * Crop a white letterbox / inset frame if Imagine adds one.
 * Does not recolor the floor — grey-to-off-white cycloramas stay.
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
    const balanced = equalizeVerticalMargins(cropped);
    const encoded = jpeg.encode(
      { data: balanced.data, width: balanced.width, height: balanced.height },
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

/** Extra top cyclorama: crop then PAD to square (never upscale — that ate the margin). */
function equalizeVerticalMargins(src: Raster): Raster {
  const { width: w, height: h, data } = src;
  const bg = sampleBg(src);

  const rowHasCar = (y: number) => {
    let hits = 0;
    const step = 4;
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (chroma(data, i) > 18 || Math.abs(lum(data, i) - bg.L) > 22) hits += 1;
    }
    return hits > (w / step) * 0.08;
  };

  let top = 0;
  while (top < h * 0.42 && !rowHasCar(top)) top += 1;
  let bot = h - 1;
  while (bot > h * 0.58 && !rowHasCar(bot)) bot -= 1;

  const topGap = top;
  const botGap = h - 1 - bot;
  const extra = topGap - botGap;
  let work = src;
  if (extra >= 16 && topGap >= 24 && bot - top >= h * 0.45) {
    const cropTop = extra;
    const nh = h - cropTop;
    if (nh >= h * 0.72) {
      const cropped: Raster = { width: w, height: nh, data: new Uint8Array(w * nh * 4) };
      for (let y = 0; y < nh; y++) {
        cropped.data.set(
          data.subarray(((y + cropTop) * w) * 4, ((y + cropTop + 1) * w) * 4),
          y * w * 4,
        );
      }
      work = padToSquare(cropped, bg);
    }
  }
  return ensureMinMargin(work, bg);
}

function sampleBg(src: Raster): { r: number; g: number; b: number; L: number } {
  const { width: w, height: h, data } = src;
  const idx = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  const r = Math.round(idx.reduce((s, i) => s + data[i]!, 0) / 4);
  const g = Math.round(idx.reduce((s, i) => s + data[i + 1]!, 0) / 4);
  const b = Math.round(idx.reduce((s, i) => s + data[i + 2]!, 0) / 4);
  return { r, g, b, L: (r * 299 + g * 587 + b * 114) / 1000 };
}

function fillBg(out: Uint8Array, bg: { r: number; g: number; b: number }) {
  for (let i = 0; i < out.length; i += 4) {
    out[i] = bg.r;
    out[i + 1] = bg.g;
    out[i + 2] = bg.b;
    out[i + 3] = 255;
  }
}

function padToSquare(src: Raster, bg: { r: number; g: number; b: number }): Raster {
  const side = Math.max(src.width, src.height);
  if (src.width === side && src.height === side) return src;
  const out = new Uint8Array(side * side * 4);
  fillBg(out, bg);
  const ox = Math.floor((side - src.width) / 2);
  const oy = Math.floor((side - src.height) / 2);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = ((y + oy) * side + (x + ox)) * 4;
      out[di] = src.data[si]!;
      out[di + 1] = src.data[si + 1]!;
      out[di + 2] = src.data[si + 2]!;
      out[di + 3] = 255;
    }
  }
  return { width: side, height: side, data: out };
}

function ensureMinMargin(src: Raster, bg: { r: number; g: number; b: number; L: number }): Raster {
  const { width: w, height: h, data } = src;
  const min = Math.round(h * 0.1);
  const rowHasCar = (y: number) => {
    let hits = 0;
    for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      if (chroma(data, i) > 18 || Math.abs(lum(data, i) - bg.L) > 22) hits += 1;
    }
    return hits > w / 4 * 0.08;
  };
  let top = 0;
  while (top < h * 0.4 && !rowHasCar(top)) top += 1;
  let bot = h - 1;
  while (bot > h * 0.6 && !rowHasCar(bot)) bot -= 1;
  if (top >= min && h - 1 - bot >= min) return src;
  const carH = bot - top + 1;
  if (carH < h * 0.4) return src;
  const inner = h - 2 * min;
  const scale = inner / carH;
  if (scale >= 0.98) return src;
  const nw = Math.max(2, Math.round(w * scale));
  const nh = Math.max(2, Math.round(h * scale));
  const small = scaleNearest(src, nw, nh);
  return padToSquare(small, bg);
}

function scaleNearest(src: Raster, nw: number, nh: number): Raster {
  if (src.width === nw && src.height === nh) return src;
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / nw));
      const si = (sy * src.width + sx) * 4;
      const di = (y * nw + x) * 4;
      out[di] = src.data[si]!;
      out[di + 1] = src.data[si + 1]!;
      out[di + 2] = src.data[si + 2]!;
      out[di + 3] = 255;
    }
  }
  return { width: nw, height: nh, data: out };
}
