/**
 * Generate unique Palmetto studio thumbnails via xAI Grok Imagine API.
 * Requires XAI_API_KEY on Vercel. Reference photo = accuracy.
 */
import { buildThumbEditPrompt, buildThumbTextPrompt, type ThumbSubject } from "./thumb-prompt";

export type ImagineThumbResult = {
  ok: boolean;
  url?: string;
  b64?: string;
  mode: "edit" | "generate" | "skipped" | "error";
  error?: string;
};

export async function generateVehicleThumbnail(opts: {
  car: ThumbSubject;
  /** Real dealer photo URLs (prefer exterior 3/4 or side). */
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
    if (refs.length > 0) {
      // Image edit with real car photo(s) for fidelity
      const body: Record<string, unknown> = {
        model: "grok-imagine-image-quality",
        prompt: buildThumbEditPrompt(opts.car),
        aspect_ratio: "1:1",
        response_format: "url",
      };
      if (refs.length === 1) {
        body.image = { url: refs[0], type: "image_url" };
      } else {
        body.image = refs.map((url) => ({ url, type: "image_url" }));
      }

      const res = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const json = (await res.json()) as {
        data?: { url?: string; b64_json?: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        // fall through to text generate
        console.warn("[imagine] edit failed", res.status, json.error?.message);
      } else {
        const url = json.data?.[0]?.url;
        const b64 = json.data?.[0]?.b64_json;
        if (url || b64) return { ok: true, url, b64, mode: "edit" };
      }
    }

    // Text-only generate (weaker accuracy)
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-image-quality",
        prompt: buildThumbTextPrompt(opts.car),
        aspect_ratio: "1:1",
        n: 1,
        response_format: "url",
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const json = (await res.json()) as {
      data?: { url?: string; b64_json?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, mode: "error", error: json.error?.message || `HTTP ${res.status}` };
    }
    const url = json.data?.[0]?.url;
    const b64 = json.data?.[0]?.b64_json;
    if (url || b64) return { ok: true, url, b64, mode: "generate" };
    return { ok: false, mode: "error", error: "Empty Imagine response" };
  } catch (err) {
    return {
      ok: false,
      mode: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
