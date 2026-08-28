/**
 * Dealer-site fetch. Some OEM sites (D2C) present a broken TLS chain
 * from this runtime — retry once with verification off.
 */
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import type { IncomingHttpHeaders } from "node:http";

export const DEALER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type FetchDealerPageOpts = {
  accept?: string;
  method?: string;
  body?: string;
  referer?: string;
  origin?: string;
  cookie?: string;
  headers?: Record<string, string>;
};

export type FetchDealerPageResult = {
  status: number;
  url: string;
  text: string;
  cookies: string;
};

export async function fetchDealerPage(
  url: string,
  opts?: FetchDealerPageOpts,
): Promise<FetchDealerPageResult> {
  const headers: Record<string, string> = {
    "user-agent": DEALER_UA,
    accept: opts?.accept || "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "accept-language": "en-CA,en;q=0.9",
    "accept-encoding": "identity",
    ...(opts?.headers || {}),
  };
  if (opts?.referer) headers.referer = opts.referer;
  if (opts?.origin) headers.origin = opts.origin;
  if (opts?.cookie) headers.cookie = opts.cookie;
  if (opts?.body && !headers["content-type"]) headers["content-type"] = "application/json";

  try {
    return await request(url, { ...opts, headers, insecure: false, redirects: 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/certificate|CERT|TLS|SSL|unable to verif/i.test(msg)) throw err;
    return request(url, { ...opts, headers, insecure: true, redirects: 0 });
  }
}

function mergeCookies(...parts: Array<string | undefined>): string {
  const map = new Map<string, string>();
  for (const part of parts) {
    if (!part) continue;
    for (const pair of part.split(";")) {
      const trimmed = pair.trim();
      if (!trimmed || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const name = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!name) continue;
      map.set(name, value);
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function cookiesFromHeaders(headers: IncomingHttpHeaders): string {
  const raw = headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((c) => String(c).split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function request(
  url: string,
  opts: FetchDealerPageOpts & {
    headers: Record<string, string>;
    insecure: boolean;
    redirects: number;
  },
): Promise<FetchDealerPageResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const reqOpts: https.RequestOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || undefined,
      path: `${u.pathname}${u.search}`,
      method: opts.method || "GET",
      headers: opts.headers,
      timeout: 30_000,
    };
    if (isHttps) reqOpts.rejectUnauthorized = !opts.insecure;
    const req = lib.request(reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => {
        const status = res.statusCode || 0;
        const loc = res.headers.location;
        const jar = mergeCookies(opts.headers.cookie, cookiesFromHeaders(res.headers));
        if (status >= 300 && status < 400 && loc && (opts.method || "GET") === "GET") {
          if (opts.redirects >= 8) {
            reject(new Error("too many redirects"));
            return;
          }
          const next = new URL(loc, url).toString();
          request(next, {
            ...opts,
            headers: { ...opts.headers, cookie: jar },
            redirects: opts.redirects + 1,
          }).then(resolve, reject);
          return;
        }
        resolve({
          status,
          url,
          text: Buffer.concat(chunks).toString("utf8"),
          cookies: jar,
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export function dollarsToCents(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 1000) return 0;
  return Math.round(n * 100);
}
