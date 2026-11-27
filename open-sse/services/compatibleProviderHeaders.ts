import { isForbiddenCustomHeaderName } from "@/shared/constants/upstreamHeaders";

const asHeaderObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function parseCustomHeaders(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return asHeaderObject(raw);
  try {
    return asHeaderObject(JSON.parse(raw));
  } catch {
    return null;
  }
}

function assignHeaderCaseInsensitive(
  headers: Record<string, string>,
  name: string,
  value: string
): void {
  const lower = name.toLowerCase();
  for (const existing of Object.keys(headers)) {
    if (existing.toLowerCase() === lower) delete headers[existing];
  }
  headers[name] = value;
}

/**
 * Apply operator-configured per-provider custom headers onto an outgoing header
 * map. Defense-in-depth on top of the Zod `customHeadersSchema`:
 *  - skip hop-by-hop/framing AND auth header names (canonical denylist, so a row
 *    written before the schema tightening still can't override credential auth);
 *  - skip control-char (CR/LF/NUL) names/values before they reach undici;
 *  - assign case-insensitively, replacing any existing same-named header (e.g.
 *    the executor's own Content-Type/Accept) instead of emitting a duplicate.
 * Used for every *-compatible node, INCLUDING anthropic-compatible-cc-* (whose
 * header builder returns early, so custom headers must be merged in explicitly)
 * and custom JSON API nodes (open-sse/executors/customJson.ts).
 */
export function applyCustomHeaders(
  headers: Record<string, string>,
  rawCustomHeaders: unknown
): void {
  const customHeaders = parseCustomHeaders(rawCustomHeaders);
  if (!customHeaders) return;
  for (const [name, value] of Object.entries(customHeaders)) {
    if (typeof value !== "string" || isForbiddenCustomHeaderName(name)) continue;
    if (/[\r\n\0]/.test(name) || /[\r\n]/.test(value)) continue;
    assignHeaderCaseInsensitive(headers, name, value);
  }
}

export function getUserAgentHeader(
  headers?: Headers | Record<string, unknown> | null
): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get("user-agent");
  for (const name in headers) {
    const value = headers[name];
    if (name.toLowerCase() === "user-agent" && typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function applyCompatibleUserAgent(
  headers: Record<string, string>,
  customHeaders?: unknown,
  clientUserAgent?: string | null
): Record<string, string> {
  const configured = getUserAgentHeader(parseCustomHeaders(customHeaders));
  const userAgent = configured || clientUserAgent;
  if (userAgent && /^[\t\x20-\x7e\x80-\xff]+$/.test(userAgent)) {
    assignHeaderCaseInsensitive(headers, "User-Agent", userAgent);
  }
  return headers;
}
