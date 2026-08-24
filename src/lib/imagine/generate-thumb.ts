/**
 * Generate unique Palmetto studio thumbnails via xAI Grok Imagine API.
 * Always persists output to a durable data URI — imgen.x.ai tmp URLs expire (404).
 * Style-lock is image[0] (composition master); subject is image[1] (identity only).
 */
import {
  buildThumbEditPrompt,
  buildThumbTextPrompt,
  buildStyleLockAddendum,
  type ThumbSubject,
} from "./thumb-prompt";
import { persistImagineResult } from "./persist-image";
import { selectImagineRefs } from "@/lib/leasing/gallery";

export type ImagineThumbResult = {
  ok: boolean;
  /** Durable URL (data:image/... preferred). Never store raw xai-tmp URLs. */
  url?: string;
  b64?: string;
  mode: "edit" | "generate" | "skipped" | "error";
  /** photographed = from this car's listing photos; inferred = guess / stock. */
  source?: "photographed" | "inferred";
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
const STYLE_LOCK_PATH = "/vehicles/palmetto-style-lock.jpg";

export async function generateVehicleThumbnail(opts: {
  car: ThumbSubject;
  referencePhotoUrls?: string[];
  publicOrigin?: string;
  /** True when listing cover is AutoTrader stock / no real dealer photography yet. */
  listingPhotosArePlaceholder?: boolean;
}): Promise<ImagineThumbResult> {
  const placeholder = Boolean(opts.listingPhotosArePlaceholder);
  const editSource = placeholder ? "inferred" : "photographed";
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    return { ok: false, mode: "skipped", error: "XAI_API_KEY not set" };
  }

  // Prefer 2–3 exterior-looking refs; skip nothing — API needs subject identity
  const refs = selectImagineRefs(opts.referencePhotoUrls || [], { limit: 4 });
  const origin =
    opts.publicOrigin ||
    process.env.PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    "https://www.palmettoleasing.com";
  const styleLockUrl = `${origin.replace(/\/$/, "")}${STYLE_LOCK_PATH}`;
  const prompt = buildThumbEditPrompt(opts.car) + buildStyleLockAddendum();

  try {
    const styleUri = (await fetchImageAsDataUri(styleLockUrl)) || null;

    const subjectUris: { uri: string; url: string }[] = [];
    for (const ref of refs) {
      if (subjectUris.length >= 2) break;
      const subjectUri = await fetchImageAsDataUri(ref);
      if (subjectUri) subjectUris.push({ uri: subjectUri, url: ref });
    }

    if (styleUri && subjectUris.length) {
      const image = [
        { url: styleUri, type: "image_url" },
        ...subjectUris.map((s) => ({ url: s.uri, type: "image_url" })),
      ];
      const dual = await callXaiJson(EDIT_URL, key, {
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        response_format: "b64_json",
        image,
      });
      const persisted = await finalize(dual);
      if (persisted) return { ok: true, url: persisted, mode: "edit", source: editSource };

      const imageUrl = [
        { url: styleLockUrl, type: "image_url" },
        ...subjectUris.map((s) => ({ url: s.url, type: "image_url" })),
      ];
      const dualUrl = await callXaiJson(EDIT_URL, key, {
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        response_format: "url",
        image: imageUrl,
      });
      const dualUrlP = await finalize(dualUrl);
      if (dualUrlP) return { ok: true, url: dualUrlP, mode: "edit", source: editSource };
    } else if (subjectUris[0]) {
      const single = await callXaiJson(EDIT_URL, key, {
        model: MODEL,
        prompt: buildThumbEditPrompt(opts.car),
        aspect_ratio: "1:1",
        response_format: "b64_json",
        image: { url: subjectUris[0].uri, type: "image_url" },
      });
      const singleP = await finalize(single);
      if (singleP) return { ok: true, url: singleP, mode: "edit", source: editSource };
    }

    const gen = await callXaiJson(GEN_URL, key, {
      model: MODEL,
      prompt: buildThumbTextPrompt(opts.car),
      aspect_ratio: "1:1",
      n: 1,
      response_format: "b64_json",
    });
    const genP = await finalize(gen);
    if (genP) return { ok: true, url: genP, mode: "generate", source: "inferred" };

    return { ok: false, mode: "error", error: gen.error || "Imagine returned no durable image" };
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
