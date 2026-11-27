export const NOAUTH_PROVIDERS: Record<string, any> = {};

// Provider-level proxy controls are exposed only for transports whose complete
// upstream path runs through OmniRoute's proxy-aware global fetch. Providers
// with browser, WebSocket, direct dispatcher, media, or local CLI paths stay
// hidden until those paths can guarantee the configured provider proxy.
export const NOAUTH_PROVIDER_PROXY_SUPPORTED = new Set<string>();

export function supportsNoAuthProviderProxy(providerId: string): boolean {
  return NOAUTH_PROVIDER_PROXY_SUPPORTED.has(providerId);
}
