/**
 * One Imagine edit: listing photo first, greyscale camera plate second.
 * Public URLs so xAI fetches — data URIs made the Vercel function time out.
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
        resolution: "2k",
        response_format: "url",
        images: [asImg(ref), asImg(STYLE_LOCK_URL)],
      }, key);
      const persisted = await finalize(dual);
      if (persisted) return { ok: true, url: persisted, mode: "edit", source: editSource };
      lastErrors.push(dual.error || "url edit empty");

      const subjectUri = await fetchImageAsDataUri(ref);
      if (!subjectUri) {
        lastErrors.push(`download failed: ${ref.slice(0, 90)}`);
        continue;
      }
      const dualB64 = await callXaiJson({
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        resolution: "2k",
        response_format: "url",
        images: [asImg(subjectUri), asImg(STYLE_LOCK_URL)],
      }, key);
      const persistedB = await finalize(dualB64);
      if (persistedB) return { ok: true, url: persistedB, mode: "edit", source: editSource };
      lastErrors.push(dualB64.error || "data-uri edit empty");
    }

    return {
      ok: false,
      mode: "error",
      error: lastErrors[0] || "Imagine edit failed",
    };
  } catch (err) {
    return {
      ok: false,
      mode: "error",
      error: err instanceof Error ? err.message : String(err),
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
    signal: AbortSignal.timeout(100_000),
  });

  const text = await res.text();
  let json: XaiImageResponse | null = null;
  try {
    if (text) json = JSON.parse(text) as XaiImageResponse;
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 240);
    return {
      ok: false,
      error: res.ok ? `Non-JSON response: ${snippet}` : `HTTP ${res.status}: ${snippet || res.statusText}`,
    };
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (json) {
      if (typeof json.error === "object" && json.error?.message) msg = json.error.message;
      else if (typeof json.error === "string") msg = json.error;
      else if (json.message) msg = json.message;
      else if (text) msg = text.slice(0, 200);
    } else if (text) {
      msg = text.slice(0, 200);
    }
    return { ok: false, error: String(msg) };
  }

  const urlOut = json?.data?.[0]?.url;
  const b64 = json?.data?.[0]?.b64_json;
  if (urlOut || b64) return { ok: true, url: urlOut, b64 };
  return { ok: false, error: "Empty Imagine response (no url/b64)" };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (name === "AbortError" || name === "TimeoutError" || /aborted/i.test(msg)) {
      return { ok: false, error: "Imagine timed out — try again" };
    }
    return { ok: false, error: msg };
  }
}

async function fetchImageAsDataUri(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(upgradeImageUrl(imageUrl), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; PalmettoLeasingBot/2.0; +https://palmettoleasing.com)",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: (() => {
          try {
            return new URL(imageUrl).origin + "/";
          } catch {
            return "https://www.palmettoleasing.com/";
          }
        })(),
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800 || buf.length > 4_500_000) return null;
    const ctype = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim();
    if (!ctype.startsWith("image/")) return null;
    return `data:${ctype};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
