/**
 * Hero-dominant identity sheet: the dealer MAIN shot fills the top ~3/4
 * (paint/this VIN). A thin strip under it holds rear + interior so Imagine
 * can see slats/wing/seats without treating them as extra cars.
 */
import jpeg from "jpeg-js";

type Raster = { width: number; height: number; data: Uint8Array };

const SHEET = 1024;
const STRIP = 256;
const HERO_H = SHEET - STRIP;
const FLOOR = 240;

function decodeJpegDataUri(dataUri: string): Raster | null {
  if (!dataUri.startsWith("data:image/jpeg") && !dataUri.startsWith("data:image/jpg")) {
    return null;
  }
  const comma = dataUri.indexOf(",");
  if (comma < 0) return null;
  try {
    const buf = Buffer.from(dataUri.slice(comma + 1), "base64");
    const decoded = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 48 });
    if (!decoded?.data || decoded.width < 32 || decoded.height < 32) return null;
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data as Uint8Array,
    };
  } catch {
    return null;
  }
}

function fillGrey(r: Raster) {
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = FLOOR;
    d[i + 1] = FLOOR;
    d[i + 2] = FLOOR;
    d[i + 3] = 255;
  }
}

function blitCover(
  dst: Raster,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  src: Raster,
) {
  const scale = Math.max(dw / src.width, dh / src.height);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx0 = (src.width - sw) / 2;
  const sy0 = (src.height - sh) / 2;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.height - 1, Math.max(0, Math.floor(sy0 + y / scale)));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.width - 1, Math.max(0, Math.floor(sx0 + x / scale)));
      const si = (sy * src.width + sx) * 4;
      const di = ((dy + y) * dst.width + (dx + x)) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = 255;
    }
  }
}

/** Returns a jpeg data URI, or null if nothing decoded. */
export function buildIdentityContactSheet(opts: {
  front?: string | null;
  rear?: string | null;
  interior?: string | null;
}): string | null {
  const front = opts.front ? decodeJpegDataUri(opts.front) : null;
  const rear = opts.rear ? decodeJpegDataUri(opts.rear) : null;
  const interior = opts.interior ? decodeJpegDataUri(opts.interior) : null;
  if (!front && !rear && !interior) return null;
  if (front && !rear && !interior) return opts.front || null;

  const sheet: Raster = {
    width: SHEET,
    height: SHEET,
    data: new Uint8Array(SHEET * SHEET * 4),
  };
  fillGrey(sheet);
  if (front) blitCover(sheet, 0, 0, SHEET, HERO_H, front);
  if (rear) blitCover(sheet, 0, HERO_H, SHEET / 2, STRIP, rear);
  if (interior) blitCover(sheet, SHEET / 2, HERO_H, SHEET / 2, STRIP, interior);

  try {
    const encoded = jpeg.encode(
      { data: sheet.data, width: sheet.width, height: sheet.height },
      82,
    );
    if (!encoded?.data?.length) return opts.front || null;
    return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
  } catch {
    return opts.front || null;
  }
}
