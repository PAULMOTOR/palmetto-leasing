/**
 * GTA (and others) put cabin shots in the first gallery slots. Imagine then
 * paints an SUV from the seats. Skip those as the studio-tile source.
 *
 * Cabins we see: dark headliner at the top, or a bright windshield over seats.
 * Exteriors have the car body as a dark mass along the bottom.
 */
import jpeg from "jpeg-js";

type Raster = { width: number; height: number; data: Uint8Array };

export function looksLikeCabinDataUri(dataUri: string): boolean {
  if (!dataUri.startsWith("data:image/")) return false;
  const comma = dataUri.indexOf(",");
  if (comma < 0) return false;
  try {
    const buf = Buffer.from(dataUri.slice(comma + 1), "base64");
    const decoded = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 96 });
    if (!decoded?.data || decoded.width < 32) return false;
    return looksLikeCabinRaster({
      width: decoded.width,
      height: decoded.height,
      data: decoded.data as Uint8Array,
    });
  } catch {
    return false;
  }
}

export function looksLikeCabinRaster(src: Raster): boolean {
  if (src.width < 32 || src.height < 32) return false;
  const h = src.height;
  const top = avgLum(src, 0, Math.floor(h * 0.22));
  const mid = avgLum(src, Math.floor(h * 0.38), Math.floor(h * 0.58));
  const bot = avgLum(src, Math.floor(h * 0.72), h);
  if (top < 42) return true;
  // Windshield over pale seats — not a dark car body in front of a glass building.
  if (top > mid + 38 && bot > 95 && mid > 80) return true;
  return false;
}

function lum(data: Uint8Array, i: number): number {
  return (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
}

function avgLum(src: Raster, y0: number, y1: number): number {
  const { width: w, data } = src;
  let s = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = 0; x < w; x += 3) {
      s += lum(data, (y * w + x) * 4);
      n += 1;
    }
  }
  return n ? s / n : 0;
}
