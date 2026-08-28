/**
 * Dual-image studio tile: dealer exterior (this VIN) + greyscale camera plate.
 * Contact-sheet collages were inverting cars and bleeding cabin color onto paint.
 */
import { buildThumbEditPrompt, STUDIO_PROMPT_REV, type ThumbSubject } from "./thumb-prompt";
import { persistImagineResult } from "./persist-image";
import { selectIdentityViews, upgradeImageUrl } from "@/lib/leasing/gallery";
import { reviewStudioTile } from "./tile-qa";

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
  const editSource = opts.listingPhotosArePlaceholder ? "inferred" : "photographed";
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return { ok: false, mode: "skipped", error: "XAI_API_KEY not set" };

  const fromUploads = Boolean(opts.identityDataUris?.front);
  const asImg = (url: string) => ({ url, type: "image_url" as const, detail: "high" });

  try {
    let front: string | null = null;
    let rear: string | null = null;

    if (opts.identityDataUris?.front) {
      front = opts.identityDataUris.front;
      rear = opts.identityDataUris.rear || null;
    } else {
      const views = selectIdentityViews(opts.referencePhotoUrls || []);
      const frontUrl = views.front ? upgradeImageUrl(views.front) : "";
      if (!frontUrl) return { ok: false, mode: "error", error: "No listing photos to render from" };
      front = await fetchImageAsDataUri(frontUrl);
      if (!front && views.rear) {
        front = await fetchImageAsDataUri(upgradeImageUrl(views.rear));
      }
      rear = views.rear ? await fetchImageAsDataUri(upgradeImageUrl(views.rear)) : null;
      if (rear && front && rear === front) rear = null;
    }

    if (!front) return { ok: false, mode: "error", error: "Could not download a listing photo" };

    const hasRear = Boolean(rear && rear !== front);
    const prompt = buildThumbEditPrompt(opts.car, { fromUploads, hasRear });
    const images = [asImg(front), asImg(STYLE_LOCK_URL)];
    if (hasRear && rear) images.push(asImg(rear));

    const dual = await callXai(
      {
        model: MODEL,
        prompt,
        aspect_ratio: "1:1",
        response_format: "b64_json",
        images,
      },
      key,
    );
    if (!dual.ok) return { ok: false, mode: "error", error: dual.error || "Imagine failed" };

    const persisted = await persistImagineResult({ b64: dual.b64, url: dual.url });
    if (!("durableUrl" in persisted)) {
      return { ok: false, mode: "error", error: persisted.error };
    }

    const qa = await reviewStudioTile({
      tileDataUri: persisted.durableUrl,
      car: opts.car,
      apiKey: key,
    });
    if (!qa.ok) {
      return {
        ok: false,
        mode: "rejected",
        error: `QA: ${qa.reason}`,
        qa: qa.reason,
        rev: STUDIO_PROMPT_REV,
      };
    }

    return {
      ok: true,
      url: persisted.durableUrl,
      mode: "edit",
      source: editSource,
      qa: qa.reason,
      rev: STUDIO_PROMPT_REV,
    };
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
