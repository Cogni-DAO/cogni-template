// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { lookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  )
    return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(normalized) === 4 ? normalized : undefined);
  if (!ipv4) return false;
  const [a = 0, b = 0] = ipv4.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Fetch `/version` with DNS resolution performed by the actual socket lookup callback.
 * Every answer must be globally routable; redirects and IP-literal endpoints are rejected.
 */
export async function safeVersionProbe(
  endpoint: string,
  expectedSourceSha?: string,
  timeoutMs = 5_000
): Promise<boolean> {
  const raw =
    endpoint.startsWith("http://") || endpoint.startsWith("https://")
      ? endpoint
      : `http://${endpoint}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    isIP(url.hostname) !== 0 ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local")
  )
    return false;
  url.pathname = `${url.pathname.replace(/\/$/, "")}/version`;
  url.search = "";
  url.hash = "";

  const addresses = await new Promise<{ address: string; family: number }[]>(
    (resolve) => {
      lookup(url.hostname, { all: true, verbatim: true }, (error, result) => {
        resolve(error ? [] : result);
      });
    }
  );
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    return false;
  }
  const selected = addresses[0];
  if (!selected) return false;

  return new Promise<boolean>((resolve) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        timeout: timeoutMs,
        lookup: (_hostname, _options, callback) => {
          callback(null, selected.address, selected.family as 4 | 6);
        },
      },
      (response) => {
        if (
          (response.statusCode ?? 500) < 200 ||
          (response.statusCode ?? 500) >= 300
        ) {
          response.resume();
          resolve(false);
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          if (body.length <= 16_384) body += chunk;
        });
        response.on("end", () => {
          if (body.length > 16_384) return resolve(false);
          if (!expectedSourceSha) return resolve(true);
          try {
            const parsed = JSON.parse(body) as { buildSha?: unknown };
            resolve(parsed.buildSha === expectedSourceSha);
          } catch {
            resolve(false);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
    request.end();
  });
}
