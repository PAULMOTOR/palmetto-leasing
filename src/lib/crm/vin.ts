/** NHTSA vPIC decode. A partial year/make is a success. Error 1, 2, and 14 are not failures. */

export type VinDecode = {
  ok: boolean;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  /** Set when the model came from NHTSA's suggested VIN. The typed VIN is not changed. */
  note?: string;
};

type VehicleBits = {
  year: number | null;
  make: string;
  model: string;
  trim: string;
  suggested: string;
};

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function yearOf(v: unknown): number | null {
  const n = Number(text(v).replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n >= 1980 && n <= 2100 ? n : null;
}

export function vehicleFromNhtsa(row: Record<string, unknown>): VehicleBits {
  const trim = [text(row.Series), text(row.Trim), text(row.Trim2)].filter(Boolean).join(" ");
  return {
    year: yearOf(row.ModelYear),
    make: text(row.Make),
    model: text(row.Model),
    trim,
    suggested: text(row.SuggestedVIN).replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
  };
}

/** Fill blanks from the suggested VIN only when make and year still agree. */
export function mergeNhtsa(primary: VehicleBits, suggested: VehicleBits | null): VinDecode {
  let year = primary.year;
  let make = primary.make;
  let model = primary.model;
  let trim = primary.trim;
  let note: string | undefined;
  if (suggested) {
    const sameMake = !make || !suggested.make || make.toLowerCase() === suggested.make.toLowerCase();
    const sameYear = !year || !suggested.year || year === suggested.year;
    if (sameMake && sameYear) {
      if (!year && suggested.year) year = suggested.year;
      if (!make && suggested.make) make = suggested.make;
      if (!model && suggested.model) {
        model = suggested.model;
        note = "NHTSA corrected one character to find the model. The VIN you typed was not changed.";
      }
      if (!trim && suggested.trim) trim = suggested.trim;
    }
  }
  if (!year && !make && !model) return { ok: false };
  return {
    ok: true,
    year: year || undefined,
    make: make || undefined,
    model: model || undefined,
    trim: trim || undefined,
    note,
  };
}

async function nhtsaRow(vin: string): Promise<Record<string, unknown> | null> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { Results?: Array<Record<string, unknown>> };
  return json.Results?.[0] || null;
}

export async function decodeVinNhtsa(vin: string): Promise<VinDecode> {
  const clean = vin.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length !== 17) return { ok: false };
  const row = await nhtsaRow(clean);
  if (!row) return { ok: false };
  const primary = vehicleFromNhtsa(row);
  let suggested: VehicleBits | null = null;
  if (
    primary.suggested.length === 17 &&
    primary.suggested !== clean &&
    (!primary.model || !primary.year || !primary.make)
  ) {
    const alt = await nhtsaRow(primary.suggested);
    if (alt) suggested = vehicleFromNhtsa(alt);
  }
  return mergeNhtsa(primary, suggested);
}
