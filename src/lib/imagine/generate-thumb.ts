/**
 * Fast 1K dual-image edit (the 15–20s path that made the good tiles).
 * Do not request 2K — it times out on Vercel.
 */
import {
  buildThumbEditPrompt,
  buildStyleLockAddendum,
  type ThumbSubject,
} from "./thumb-prompt";
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
  const placeholder = Boolean(opts.listingPhotosArePlaceholder);
  const editSource = placeholder ? "inferred" : "photographed";
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    return { ok: false, mode: "skipped", error: "XAI_API_KEY not set" };
  }

  const refs = selectImagineRefs(opts.referencePhotoUrls || [], { limit: 2 }).map(upgradeImageUrl);
  if (!refs.length) {
    return { ok: false, mode: "error", error: "No listing photos to render from" };
  }

  const prompt = buildThumbEditPrompt(opts.car) + buildStyleLockAddendum();
  const asImg = (url: string) => ({ url, type: "image_url" as const, detail: "high" });
  const lastErrors: string[] = [];

  try {
    for (const ref of refs) {
      const dual = await callXaiJson({
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        response_format: "url",
        images: [asImg(ref), asImg(STYLE_LOCK_URL)],
      }, key);
      const persisted = await finalize(dual);
      if (persisted) return { ok: true, url: persisted, mode: "edit", source: editSource };
      lastErrors.push(dual.error || "edit empty");
    }

    return {
      ok: false,
      mode: "error",
      error: lastErrors[0] || "Imagine edit failed",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mode: "error",
      error: /aborted/i.test(msg) ? "Imagine timed out — try again" : msg,
    };
  }
}

async function finalize(result: {
  ok: boolean;
  url?: string;
  b64?: string;
  error?: string;
}): Promise<string | null> {
  if (!result.ok) return null;
  const persisted = await persistImagineResult({ url: result.url, b64: result.b64 });
  if ("durableUrl" in persisted) return persisted.durableUrl;
  return null;
}

async function callXaiJson(
  body: Record<string, unknown>,
  key: string,
): Promise<{ ok: boolean; url?: string; b64?: string; error?: string }> {
  try {
    const res = await fetch(EDIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await res.text();
    let json: XaiImageResponse | null = null;
    try {
      if (text) json = JSON.parse(text) as XaiImageResponse;
    } catch {
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 180)}` };
    }
    if (!res.ok) {
      const err = json?.error;
      const msg =
        (typeof err === "object" && err?.message) ||
        (typeof err === "string" ? err : "") ||
        json?.message ||
        text.slice(0, 180);
      return { ok: false, error: String(msg || `HTTP ${res.status}`) };
    }
    const urlOut = json?.data?.[0]?.url;
    const b64 = json?.data?.[0]?.b64_json;
    if (urlOut || b64) return { ok: true, url: urlOut, b64 };
    return { ok: false, error: "Empty Imagine response" };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (name === "AbortError" || name === "TimeoutError" || /aborted/i.test(msg)) {
      return { ok: false, error: "Imagine timed out — try again" };
    }
    return { ok: false, error: msg };
  }
}
