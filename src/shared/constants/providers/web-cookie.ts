export const WEB_COOKIE_PROVIDERS: Record<string, any> = {
  "gemini-web": {
    id: "gemini-web",
    serviceKinds: ["llm"],
    alias: "gweb",
    name: "Gemini Web (Free)",
    icon: "auto_awesome",
    color: "#4285F4",
    textIcon: "GWeb",
    website: "https://gemini.google.com",
    authHint:
      "Paste the full cookie header, the __Secure-1PSID value, or the JSON export containing cookies from gemini.google.com. Include __Secure-1PSIDTS and __Secure-1PSIDCC when available.",
    subscriptionRisk: true,
    riskNoticeVariant: "webCookie",
    // #7286 Level 2: tools[] is prompt-emulated via webTools.ts (parseToolCallsFromText).
    toolCalling: "emulated",
  },
  "deepseek-web": {
    id: "deepseek-web",
    serviceKinds: ["llm"],
    alias: "ds-web",
    name: "DeepSeek Web",
    icon: "auto_awesome",
    color: "#4D6BFE",
    textIcon: "DS",
    website: "https://chat.deepseek.com",
    authHint:
      "Paste your userToken from chat.deepseek.com — DevTools → Application → Local Storage → userToken",
    subscriptionRisk: true,
    riskNoticeVariant: "webCookie",
    toolCalling: "emulated",
  },
};

/** Resolved public site for a web-session provider (href + display host). */
export interface WebProviderHostLink {
  /** Full URL to open in a new tab (the provider's own `website`, or the origin
   * derived from a registry baseUrl fallback). */
  url: string;
  /** Display host, e.g. `chatgpt.com` — used for the "Open ‹host› →" label. */
  host: string;
}

/**
 * Resolve the public website + display host for a web-session provider so the
 * "Add session cookie" modal can render a prominent "Open ‹host› →" link.
 *
 * Primary source: `WEB_COOKIE_PROVIDERS[providerId].website`. When an entry has
 * no `website` (or the provider is not in the catalog but the caller knows it is
 * a web-session provider), the caller may pass its registry `baseUrl` as a
 * fallback — only the origin is kept from it.
 *
 * Pure and React-free (unit-testable). Web-ness gating is the caller's
 * responsibility: with no `fallbackBaseUrl`, a provider absent from
 * `WEB_COOKIE_PROVIDERS` resolves to `null`.
 */
export function resolveWebProviderHost(
  providerId: string | null | undefined,
  fallbackBaseUrl?: string | null
): WebProviderHostLink | null {
  if (!providerId) return null;
  const entry = (WEB_COOKIE_PROVIDERS as Record<string, { website?: string }>)[providerId];
  const website = entry?.website?.trim();
  const fallback = fallbackBaseUrl?.trim();
  const source = website || fallback;
  if (!source) return null;
  try {
    const parsed = new URL(source);
    // Keep the website URL verbatim (it may point at a specific path like
    // `/chat`); for a registry baseUrl fallback, keep only the origin.
    return { url: website ? source : parsed.origin, host: parsed.host };
  } catch {
    return null;
  }
}
