/**
 * Last week's working path: 1K jpeg, one Imagine call, ~15s, ~150KB.
 */
import { buildThumbEditPrompt, type ThumbSubject } from "./thumb-prompt";
import { persistImagineResult } from "./persist-image";
import { selectImagineRefs, upgradeImageUrl } from "@/lib/leasing/gallery";

export type ImagineThumbResult = {
  ok: boolean;
  url?: string;
  b64?: string;
  mode: "edit" | "generate" | "skipped" | "error";
  source?: "photographed" | "inferred";
  error?: string;
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
}): Promise<ImagineThumbResult> {
  const editSource = opts.listingPhotosArePlaceholder ? "inferred" : "photographed";
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return { ok: false, mode: "skipped", error: "XAI_API_KEY not set" };

  const refs = selectImagineRefs(opts.referencePhotoUrls || [], { limit: 2 }).map(upgradeImageUrl);
  if (!refs.length) return { ok: false, mode: "error", error: "No listing photos to render from" };

  const prompt = buildThumbEditPrompt(opts.car);
  const asImg = (url: string) => ({ url, type: "image_url" as const, detail: "high" });

  try {
    for (const ref of refs) {
      const subject = await fetchImageAsDataUri(ref);
      if (!subject) continue;

      const dual = await callXai({
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        response_format: "b64_json",
        images: [asImg(subject), asImg(STYLE_LOCK_URL)],
      }, key);
      if (!dual.ok) return { ok: false, mode: "error", error: dual.error || "Imagine failed" };

      const persisted = await persistImagineResult({ b64: dual.b64, url: dual.url });
      if ("durableUrl" in persisted) {
        return { ok: true, url: persisted.durableUrl, mode: "edit", source: editSource };
      }
      return { ok: false, mode: "error", error: persisted.error };
    }
    return { ok: false, mode: "error", error: "Could not download a listing photo" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, mode: "error", error: /aborted|load failed/i.test(msg) ? "Imagine timed out" : msg };
  }
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

async function fetchImageAsDataUri(imageUrl: string): Promise<string | null> {
  const url = upgradeImageUrl(imageUrl);
  let referer = "https://www.palmettoleasing.com/";
  try {
    const host = new URL(url).hostname;
    if (/autoscout24|autotrader/i.test(host)) referer = "https://www.autotrader.ca/";
    if (/gclcars|dp-prod\.s3/i.test(host)) referer = "https://www.gclcars.ca/";
  } catch {
    /* keep */
  }
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "image/jpeg,image/webp,image/*,*/*;q=0.8",
        referer,
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800 || buf.length > 3_000_000) return null;
    let ctype = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim();
    if (!ctype.startsWith("image/")) ctype = "image/jpeg";
    return `data:${ctype};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
