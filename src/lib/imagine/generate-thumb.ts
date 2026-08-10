/**
 * Generate unique Palmetto studio thumbnails via xAI Grok Imagine API.
 * Locked composition: pure #FFFFFF, nose-up top-down, consistent scale.
 * Subject photo (dealer) + optional style-lock reference.
 */
import {
  buildThumbEditPrompt,
  buildThumbTextPrompt,
  buildStyleLockAddendum,
  type ThumbSubject,
} from "./thumb-prompt";

export type ImagineThumbResult = {
  ok: boolean;
  url?: string;
  b64?: string;
  mode: "edit" | "generate" | "skipped" | "error";
  error?: string;
};

type XaiImageResponse = {
  data?: { url?: string; b64_json?: string }[];
  error?: { message?: string } | string;
  message?: string;
};

const EDIT_URL = "https://api.x.ai/v1/images/edits";
const GEN_URL = "https://api.x.ai/v1/images/generations";
const MODEL = "grok-imagine-image-quality";

/** Public URL path for composition lock (served by this site). */
const STYLE_LOCK_PATH = "/vehicles/palmetto-style-lock.jpg";

export async function generateVehicleThumbnail(opts: {
  car: ThumbSubject;
  referencePhotoUrls?: string[];
  /** Absolute site origin for style-lock, e.g. https://www.palmettoleasing.com */
  publicOrigin?: string;
}): Promise<ImagineThumbResult> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      mode: "skipped",
      error: "XAI_API_KEY not set",
    };
  }

  const refs = (opts.referencePhotoUrls || []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 2);
  const origin =
    opts.publicOrigin ||
    process.env.PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    "https://www.palmettoleasing.com";
  const styleLockUrl = `${origin.replace(/\/$/, "")}${STYLE_LOCK_PATH}`;

  const prompt = buildThumbEditPrompt(opts.car) + buildStyleLockAddendum();

  try {
    for (const ref of refs) {
      const subjectUri = await fetchImageAsDataUri(ref);
      if (!subjectUri) continue;

      const styleUri = (await fetchImageAsDataUri(styleLockUrl)) || null;

      // Preferred: subject + style lock (up to 2 images)
      if (styleUri) {
        const dual = await callXaiJson(EDIT_URL, key, {
          model: MODEL,
          prompt,
          aspect_ratio: "1:1",
          response_format: "url",
          image: [
            { url: subjectUri, type: "image_url" },
            { url: styleUri, type: "image_url" },
          ],
        });
        if (dual.ok && (dual.url || dual.b64)) {
          return { ok: true, url: dual.url, b64: dual.b64, mode: "edit" };
        }
      }

      // Single subject edit with locked prompt
      const single = await callXaiJson(EDIT_URL, key, {
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        response_format: "url",
        image: { url: subjectUri, type: "image_url" },
      });
      if (single.ok && (single.url || single.b64)) {
        return { ok: true, url: single.url, b64: single.b64, mode: "edit" };
      }

      // Public URL fallback
      const byUrl = await callXaiJson(EDIT_URL, key, {
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        response_format: "url",
        image: { url: ref, type: "image_url" },
      });
      if (byUrl.ok && (byUrl.url || byUrl.b64)) {
        return { ok: true, url: byUrl.url, b64: byUrl.b64, mode: "edit" };
      }
    }

    const gen = await callXaiJson(GEN_URL, key, {
      model: MODEL,
      prompt: buildThumbTextPrompt(opts.car),
      aspect_ratio: "1:1",
      n: 1,
      response_format: "url",
    });
    if (gen.ok && (gen.url || gen.b64)) {
      return { ok: true, url: gen.url, b64: gen.b64, mode: "generate" };
    }

    return { ok: false, mode: "error", error: gen.error || "Imagine returned no image" };
  } catch (err) {
    return {
      ok: false,
      mode: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function callXaiJson(
  url: string,
  key: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; url?: string; b64?: string; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await res.text();
  let json: XaiImageResponse | null = null;

  try {
    if (text) json = JSON.parse(text) as XaiImageResponse;
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 240);
    return {
      ok: false,
      error: res.ok
        ? `Non-JSON response: ${snippet}`
        : `HTTP ${res.status}: ${snippet || res.statusText}`,
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
}

async function fetchImageAsDataUri(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
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
      signal: AbortSignal.timeout(20_000),
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
