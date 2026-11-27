// Appearance-flag resolution for the home dashboard.
//
// Regression context (#4596 → restored here): the home provider-topology card
// (the ReactFlow connection map) defaults ON — the AppearanceTab toggle reads it
// as `settings.showProviderTopologyOnHome !== false`. #4596 made HomePageClient
// initialize the flag to `false` and only flip it when the API returned an
// explicit boolean, so any install that never persisted the setting (the common
// case → the field is `undefined`) kept the card hidden forever, contradicting
// the AppearanceTab toggle. This helper centralizes the default-ON semantics so
// both surfaces agree: absent ⇒ show, explicit `false` ⇒ hide, explicit `true` ⇒ show.

/**
 * Whether the home provider-topology card should render.
 * Defaults ON; only an explicit `false` hides it (mirrors AppearanceTab).
 */
export function shouldShowProviderTopologyOnHome(setting: unknown): boolean {
  return setting !== false;
}

/**
 * Whether the "models with recent usage but no configured price" notice should
 * render on the Home page.
 *
 * Defaults ON — the notice is the only place an operator learns why a per-key
 * USD limit treats unpriced models as over quota (UNPRICED_USAGE_BUDGET_POLICY
 * `fail_closed`, #12341). Only an explicit `false` (set from Settings →
 * Appearance) hides it; absent/`null` keep the default so installs that never
 * persisted the setting still get warned.
 */
export function shouldShowUnpricedUsageBannerOnHome(setting: unknown): boolean {
  return setting !== false;
}
