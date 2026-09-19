/**
 * Dual-image studio tile: dealer exterior (this VIN) + greyscale camera plate.
 * Contact-sheet collages were inverting cars and bleeding cabin color onto paint.
 */
import { buildThumbEditPrompt, STUDIO_PROMPT_REV, type ThumbSubject } from "./thumb-prompt";
import { persistImagineResult } from "./persist-image";
import { listingPhotosInDealerOrder, upgradeImageUrl } from "@/lib/leasing/gallery";
import { reviewStudioTile } from "./tile-qa";
import { looksLikeCabinDataUri } from "./cabin-detect";

export { STUDIO_PROMPT_REV };

export type ImagineThumbResult = {
  ok: boolean;
  url?: string;
  b64?: string;
  mode: "edit" | "generate" | "skipped" | "error" | "rejected";
  source?: "photographed" | "inferred";
  error?: string;
  qa?: string;
  rev?: string;
};

type XaiImageResponse = {
  data?: { url?: string; b64_json?: string }[];
  error?: { message?: string } | string;
  message?: string;
};

const EDIT_URL = "https://api.x.ai/v1/images/edits";
const MODEL = "grok-imagine-image-quality";
const STYLE_LOCK_URL = "https://www.palmettoleasing.com/vehicles/palmetto-style-lock.jpg";

export async function generateVehicleThumbnail(opts: {
  car: ThumbSubject;
  referencePhotoUrls?: string[];
  publicOrigin?: string;
  listingPhotosArePlaceholder?: boolean;
  identityDataUris?: { front: string; rear: string; interior: string };
}): Promise<ImagineThumbResult> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return { ok: false, mode: "skipped", error: "XAI_API_KEY not set" };

  try {
    if (opts.identityDataUris?.front) {
      return paintFromSources([opts.identityDataUris.front], {
        car: opts.car,
        key,
        fromUploads: true,
        rear: opts.identityDataUris.rear,
      });
    }

    const ordered = listingPhotosInDealerOrder(opts.referencePhotoUrls || [], 16);
    if (!ordered.length) return { ok: false, mode: "error", error: "No listing photos to render from" };
    if (opts.listingPhotosArePlaceholder) {
      return { ok: false, mode: "skipped", error: "No actual dealer photography" };
    }
    const sources = await collectExteriorDataUris(ordered, 2);
    if (sources.length) {
      return paintFromSources(sources, { car: opts.car, key, fromUploads: false });
    }
    const https = ordered
      .map((u) => upgradeImageUrl(u))
      .find((u) => /^https?:\/\//i.test(u) && /autoscout24\.net\/listing-images/i.test(u));
    if (!https) return { ok: false, mode: "error", error: "Could not download a listing photo" };
    return paintFromSources([https], { car: opts.car, key, fromUploads: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, mode: "error", error: /aborted|load failed/i.test(msg) ? "Imagine timed out" : msg };
  }
}

const asImg = (url: string) => ({ url, type: "image_url" as const, detail: "high" as const });

async function paintFromSources(
  sources: string[],
  opts: {
    car: ThumbSubject;
    key: string;
    fromUploads: boolean;
    rear?: string;
  },
): Promise<ImagineThumbResult> {
  const hasRear = Boolean(opts.rear);
  const prompt = buildThumbEditPrompt(opts.car, { fromUploads: opts.fromUploads, hasRear });
  let lastError = "Imagine failed";
  for (const front of sources) {
    const images = [asImg(front), asImg(STYLE_LOCK_URL)];
    if (hasRear && opts.rear) images.push(asImg(opts.rear));
    const dual = await callXai(
      {
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        response_format: "b64_json",
        images,
      },
      opts.key,
    );
    if (!dual.ok) {
      lastError = dual.error || "Imagine failed";
      continue;
    }
    const persisted = await persistImagineResult({ b64: dual.b64, url: dual.url });
    if (!("durableUrl" in persisted)) {
      lastError = persisted.error;
      continue;
    }
    const qa = await reviewStudioTile({
      tileDataUri: persisted.durableUrl,
      car: opts.car,
      apiKey: opts.key,
    });
    if (!qa.ok) {
      lastError = `QA: ${qa.reason}`;
      continue;
    }
    return {
      ok: true,
      url: persisted.durableUrl,
      mode: "edit",
      source: "photographed",
      qa: qa.reason,
      rev: STUDIO_PROMPT_REV,
    };
  }
  return {
    ok: false,
    mode: /QA:/i.test(lastError) ? "rejected" : "error",
    error: lastError,
    qa: lastError.replace(/^QA:\s*/i, ""),
    rev: STUDIO_PROMPT_REV,
  };
}

async function callXai(
  body: Record<string, unknown>,
  key: string,
): Promise<{ ok: boolean; url?: string; b64?: string; error?: string }> {
  const res = await fetch(EDIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  const text = await res.text();
  let json: XaiImageResponse | null = null;
  try {
    if (text) json = JSON.parse(text) as XaiImageResponse;
  } catch {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  if (!res.ok) {
    const err = json?.error;
    return {
      ok: false,
      error:
        (typeof err === "object" && err?.message) ||
        (typeof err === "string" ? err : "") ||
        `HTTP ${res.status}`,
    };
  }
  const url = json?.data?.[0]?.url;
  const b64 = json?.data?.[0]?.b64_json;
  if (url || b64) return { ok: true, url, b64 };
  return { ok: false, error: "Empty Imagine response" };
}

async function collectExteriorDataUris(urls: string[], limit: number): Promise<string[]> {
  const out: string[] = [];
  for (const raw of urls.slice(0, 10)) {
    if (out.length >= limit) break;
    const data = await fetchImageAsDataUri(upgradeImageUrl(raw));
    if (!data) continue;
    const comma = data.indexOf(",");
    const bytes = comma > 0 ? Math.floor((data.length - comma) * 0.75) : 0;
    if (bytes < 12_000) continue;
    if (looksLikeCabinDataUri(data)) continue;
    out.push(data);
  }
  return out;
}

/**
 * AutoScout / AutoTrader listing-images 404 from Node's TLS fingerprint
 * (CloudFront "Error <uuid>"). Chrome impersonation (impit) downloads them.
 */
let chromeClient: Promise<import("impit").Impit | null> | null = null;

function getChromeClient() {
  if (!chromeClient) {
    chromeClient = import("impit")
      .then(({ Impit }) => new Impit({ browser: "chrome", timeout: 10_000 }))
      .catch(() => null);
  }
  return chromeClient;
}

function listingPhotoHeaders(url: string): Record<string, string> {
  let referer = "https://www.palmettoleasing.com/";
  try {
    const host = new URL(url).hostname;
    if (/autoscout24|autotrader/i.test(host)) referer = "https://www.grandtouringautos.com/";
    if (/gclcars|dp-prod\.s3/i.test(host)) referer = "https://www.gclcars.ca/";
  } catch {
    /* keep */
  }
  return {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "image/jpeg,image/webp,image/*,*/*;q=0.8",
    "accept-language": "en-CA,en;q=0.9",
    referer,
  };
}

function photoUrlCandidates(imageUrl: string): string[] {
  const raw = imageUrl.trim();
  const upgraded = upgradeImageUrl(raw);
  return [...new Set([upgraded, raw].filter(Boolean))];
}

async function fetchImageAsDataUri(imageUrl: string): Promise<string | null> {
  for (const url of photoUrlCandidates(imageUrl)) {
    const buf = await downloadListingPhoto(url);
    if (!buf) continue;
    let ctype = "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50) ctype = "image/png";
    return `data:${ctype};base64,${buf.toString("base64")}`;
  }
  return null;
}

async function downloadListingPhoto(url: string): Promise<Buffer | null> {
  const headers = listingPhotoHeaders(url);
  const autoscout = /pictures\.autoscout24\.net/i.test(url);
  if (!autoscout) {
    const plain = await nodeFetchBytes(url, headers);
    if (plain) return plain;
  }
  return chromeFetchBytes(url, headers);
}

async function nodeFetchBytes(
  url: string,
  headers: Record<string, string>,
): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800 || buf.length > 3_000_000) return null;
    return buf;
  } catch {
    return null;
  }
}

async function chromeFetchBytes(
  url: string,
  headers: Record<string, string>,
): Promise<Buffer | null> {
  try {
    const client = await getChromeClient();
    if (!client) return null;
    const res = await client.fetch(url, { headers });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800 || buf.length > 3_000_000) return null;
    return buf;
  } catch {
    return null;
  }
}
