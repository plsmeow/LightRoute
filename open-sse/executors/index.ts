import { SEARCH_PROVIDERS } from "../config/searchRegistry.ts";
import { SearchProviderChatError } from "../utils/searchProviderChatError.ts";
import { isDecisionsOnlyProvider } from "../config/decisionsProviders.ts";
import { assertMicrosoftDesignerWebProviderAvailable } from "@/shared/constants/designerWebRetirement";
import { assertRuntimeProviderAvailable } from "@/shared/constants/providerRetirement";
import { assertCommonChatGptWebProviderAvailable } from "@/shared/constants/chatgptWebRetirement";
import { registerLazyExecutor, loadRegisteredExecutor, hasRegisteredExecutor } from "./registry.ts";
// Type-only: pulls no runtime code, keeps DefaultExecutor the only eager class.
import type { BaseExecutor } from "./base.ts";
import { getDefaultExecutor } from "./defaultResolver.ts";

const lazyExecutors: Record<string, () => Promise<BaseExecutor>> = {
  antigravity: () => import("./antigravity.ts").then((m) => new m.AntigravityExecutor()),
  codex: () => import("./codex.ts").then((m) => new m.CodexExecutor()),
  kiro: () => import("./kiro.ts").then((m) => new m.KiroExecutor()),
  "opencode-go": () => import("./opencode.ts").then((m) => new m.OpencodeExecutor("opencode-go")),
  "gemini-web": () => import("./gemini-web.ts").then((m) => new m.GeminiWebExecutor()),
  gweb: () => import("./gemini-web.ts").then((m) => new m.GeminiWebExecutor()),
  "deepseek-web": () =>
    import("./deepseek-web-with-auto-refresh.ts").then(
      (m) => new m.DeepSeekWebWithAutoRefreshExecutor()
    ),
  "ds-web": () =>
    import("./deepseek-web-with-auto-refresh.ts").then(
      (m) => new m.DeepSeekWebWithAutoRefreshExecutor()
    ),
};

// Bootstrap: declare every built-in alias in the ExecutorRegistry. Duplicate
// aliases fail at module load, exactly as loudly as a duplicate object key
// would have failed at lint time. Instances materialize on first use (#11220).
for (const [alias, load] of Object.entries(lazyExecutors)) {
  registerLazyExecutor(alias, load);
}

// #6699 — providers that exist ONLY as Cloud Agent task-API entries
// (CLOUD_AGENT_PROVIDERS / staticModels "Available Models" catalog) and have no
// chat-completions REGISTRY entry anywhere in open-sse/. Without this guard,
// getExecutor() silently falls through to DefaultExecutor's
// `PROVIDERS[provider] || PROVIDERS.openai` fallback, sending the user's real
// provider key to OpenAI's endpoint (mislabeled as coming from the provider the
// user actually selected). Starting with just "jules" (the reported case);
// "devin" and "codex-cloud" share the same structural gap and are left for a
// follow-up once their own chat-routing behavior is confirmed.
const CHAT_UNSUPPORTED_CLOUD_AGENT_PROVIDERS = new Set(["jules"]);

// #10274 — providers that exist ONLY as /v1/search endpoint entries
// (SEARCH_PROVIDERS in open-sse/config/searchRegistry.ts) and have no chat-completions
// REGISTRY entry anywhere in open-sse/. Without this guard, getExecutor() silently falls
// through to DefaultExecutor's `PROVIDERS[provider] || PROVIDERS.openai` fallback, sending
// the user's real search API key (e.g. a Tavily `tvly-...` key) to OpenAI's endpoint and
// surfacing OpenAI's own "Incorrect API key provided" error for a provider the user believes
// is the search provider. The set is DERIVED from SEARCH_PROVIDERS so adding a new search
// provider without updating this guard fails the regression test automatically. Search
// providers must be executed through /v1/search, never the chat-completions path.
const CHAT_UNSUPPORTED_SEARCH_PROVIDERS = new Set(Object.keys(SEARCH_PROVIDERS));

export async function getExecutor(provider: string): Promise<BaseExecutor> {
  assertMicrosoftDesignerWebProviderAvailable(provider);
  assertRuntimeProviderAvailable(provider);
  assertCommonChatGptWebProviderAvailable(provider);
  const loaded = await loadRegisteredExecutor(provider);
  if (loaded) return loaded;
  if (CHAT_UNSUPPORTED_CLOUD_AGENT_PROVIDERS.has(provider)) {
    const err = new Error(
      `Provider "${provider}" is a cloud-agent provider and does not support direct chat completions; use the Cloud Agents task API instead.`
    );
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (CHAT_UNSUPPORTED_SEARCH_PROVIDERS.has(provider)) {
    throw new SearchProviderChatError(provider);
  }
  // #14498 — decisions-only providers (TypeSafe Jev) register for credentials,
  // pricing and discovery but have no chat shape; dispatch is POST /v1/systemone.
  if (isDecisionsOnlyProvider(provider)) {
    const err = new Error(
      `Provider "${provider}" is a System One decisions provider and does not support chat completions; use the /v1/systemone endpoint instead.`
    );
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  return getDefaultExecutor(provider);
}

export function hasSpecializedExecutor(provider: string): boolean {
  return hasRegisteredExecutor(provider);
}

export { registerExecutor, registerLazyExecutor, listExecutorAliases } from "./registry.ts";
// Value re-export: base.ts is already eager (DefaultExecutor extends it), and
// scripts/check/check-known-symbols.ts reads this export from the module.
export { BaseExecutor } from "./base.ts";
export { DefaultExecutor } from "./default.ts";
