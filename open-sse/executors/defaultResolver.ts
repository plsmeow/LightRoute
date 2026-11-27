import { DefaultExecutor } from "./default.ts";
import { getRegistryEntry } from "../config/providerRegistry.ts";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";

const defaultExecutorCache = new Map<string, DefaultExecutor>();

/** Resolve the shared fallback executor without initializing the specialized executor registry. */
export function getDefaultExecutor(provider: string): DefaultExecutor {
  if (
    !getRegistryEntry(provider) &&
    !isOpenAICompatibleProvider(provider) &&
    !isAnthropicCompatibleProvider(provider)
  ) {
    throw Object.assign(new Error("Provider is unavailable in LightRoute."), {
      code: "PROVIDER_RETIRED",
      status: 410,
    });
  }
  let executor = defaultExecutorCache.get(provider);
  if (!executor) {
    executor = new DefaultExecutor(provider);
    defaultExecutorCache.set(provider, executor);
  }
  return executor;
}
