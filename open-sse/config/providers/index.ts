import type { RegistryEntry } from "./shared.ts";
import { antigravityProvider } from "./registry/antigravity/index.ts";
import { codexProvider } from "./registry/codex/index.ts";
import { kiroProvider } from "./registry/kiro/index.ts";
import { agentrouterProvider } from "./registry/agentrouter/index.ts";
import { opencode_goProvider } from "./registry/opencode/go/index.ts";
import { gemini_webProvider } from "./registry/gemini/web/index.ts";
import { deepseek_webProvider } from "./registry/deepseek/web/index.ts";

export const REGISTRY: Record<string, RegistryEntry> = {
  antigravity: antigravityProvider,
  codex: codexProvider,
  kiro: kiroProvider,
  agentrouter: agentrouterProvider,
  "opencode-go": opencode_goProvider,
  "gemini-web": gemini_webProvider,
  "deepseek-web": deepseek_webProvider,
};
