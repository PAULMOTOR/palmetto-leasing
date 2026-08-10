/**
 * Generate unique Palmetto studio thumbnails via xAI Grok Imagine API.
 * Requires XAI_API_KEY. Downloads dealer photos server-side (CDN-safe) then edits.
 */
import { buildThumbEditPrompt, buildThumbTextPrompt, type ThumbSubject } from "./thumb-prompt";

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

export async function generateVehicleThumbnail(opts: {
  car: ThumbSubject;
  /** Real dealer photo URLs (prefer exterior). */
  referencePhotoUrls?: string[];
}): Promise<ImagineThumbResult> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      mode: "skipped",
      error: "XAI_API_KEY not set — using dealer source photo as tile until Imagine is configured",
    };
  }

  const refs = (opts.referencePhotoUrls || []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 2);

  try {
    for (const ref of refs) {
      const dataUri = await fetchImageAsDataUri(ref);
      if (!dataUri) continue;

      const editResult = await callXaiJson(EDIT_URL, key, {
        model: MODEL,
        prompt: buildThumbEditPrompt(opts.car),
        aspect_ratio: "1:1",
        response_format: "url",
        image: { url: dataUri, type: "image_url" },
      });

      if (editResult.ok && (editResult.url || editResult.b64)) {
        return { ok: true, url: editResult.url, b64: editResult.b64, mode: "edit" };
      }

      const byUrl = await callXaiJson(EDIT_URL, key, {
        model: MODEL,
        prompt: buildThumbEditPrompt(opts.car),
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

    return {
      ok: false,
      mode: "error",
      error: gen.error || "Imagine returned no image",
    };
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
        referer: new URL(imageUrl).origin + "/",
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
