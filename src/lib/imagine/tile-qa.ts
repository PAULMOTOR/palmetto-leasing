/**
 * Cheap vision gate after Imagine. Reject inverted / 3/4 / wrong-generation
 * tiles so they never land on the catalog. Time-boxed; on API failure we accept
 * (geometric shrink already ran).
 */
import type { ThumbSubject } from "./thumb-prompt";
import { vehicleDisplayTitle } from "@/lib/leasing/vehicle-label";
import jpeg from "jpeg-js";

export type TileQa = {
  ok: boolean;
  inverted: boolean;
  notOverhead: boolean;
  wrongBody: boolean;
  reason: string;
};

const QA_TIMEOUT_MS = 12_000;

export async function reviewStudioTile(opts: {
  tileDataUri: string;
  car: ThumbSubject;
  apiKey: string;
}): Promise<TileQa> {
  const accept: TileQa = {
    ok: true,
    inverted: false,
    notOverhead: false,
    wrongBody: false,
    reason: "pass",
  };
  const preview = shrinkForQa(opts.tileDataUri);
  if (!preview) return accept;

  const label = vehicleDisplayTitle(opts.car);
  const body = {
    model: "grok-4.5",
    temperature: 0,
    max_tokens: 160,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `QA a Palmetto studio tile of this exact ${label}. It MUST be an overhead boom still of ONE car on a seamless light floor. ` +
              `The car is right-side up (wheels toward the floor of the scene, roof to camera) with its NOSE pointing to the BOTTOM edge of the square. ` +
              `Reject if: the car is inverted/upside-down, nose points to the top, it is a 3/4 or side hero, a collage, a different generation/body, or the paint is obviously not a real photo of this car (grey plate leak, invented two-tone). ` +
              `Return ONLY JSON: {"ok":boolean,"inverted":boolean,"notOverhead":boolean,"wrongBody":boolean,"reason":string}`,
          },
          { type: "image_url", image_url: { url: preview, detail: "low" } },
        ],
      },
    ],
  };

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });
    if (!res.ok) return accept;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content || "";
    const parsed = parseQaJson(text);
    if (!parsed) return accept;
    const inverted = Boolean(parsed.inverted);
    const notOverhead = Boolean(parsed.notOverhead);
    const wrongBody = Boolean(parsed.wrongBody);
    const ok = parsed.ok !== false && !inverted && !notOverhead && !wrongBody;
    return {
      ok,
      inverted,
      notOverhead,
      wrongBody,
      reason: String(parsed.reason || (ok ? "pass" : "rejected")).slice(0, 180),
    };
  } catch {
    return accept;
  }
}

function parseQaJson(text: string): Partial<TileQa> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Partial<TileQa>;
  } catch {
    return null;
  }
}

/** 384px jpeg so vision stays cheap. */
function shrinkForQa(dataUri: string): string | null {
  if (!dataUri.startsWith("data:image/jpeg") && !dataUri.startsWith("data:image/jpg")) {
    return dataUri.startsWith("data:image/") ? dataUri : null;
  }
  const comma = dataUri.indexOf(",");
  if (comma < 0) return null;
  try {
    const buf = Buffer.from(dataUri.slice(comma + 1), "base64");
    const decoded = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 32 });
    if (!decoded?.data || decoded.width < 32) return dataUri;
    const side = 384;
    const out = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) {
      const sy = Math.min(decoded.height - 1, Math.floor((y / side) * decoded.height));
      for (let x = 0; x < side; x++) {
        const sx = Math.min(decoded.width - 1, Math.floor((x / side) * decoded.width));
        const si = (sy * decoded.width + sx) * 4;
        const di = (y * side + x) * 4;
        out[di] = decoded.data[si]!;
        out[di + 1] = decoded.data[si + 1]!;
        out[di + 2] = decoded.data[si + 2]!;
        out[di + 3] = 255;
      }
    }
    const encoded = jpeg.encode({ data: out, width: side, height: side }, 70);
    if (!encoded?.data?.length) return dataUri;
    return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
  } catch {
    return dataUri;
  }
}
