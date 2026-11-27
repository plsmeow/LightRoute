import { CLAUDE_CODE_CLIENT_VERSION } from "./claudeCodeClient";
import { CODEX_CLI_RS_ORIGINATOR, DEFAULT_CODEX_CLIENT_VERSION } from "./codexClient";

const presets = [
  { value: "opencode", label: "OpenCode", userAgent: "opencode/1.19.6" },
  {
    value: "codex",
    label: "Codex",
    userAgent: `${CODEX_CLI_RS_ORIGINATOR}/${DEFAULT_CODEX_CLIENT_VERSION} (Windows 10.0.26200; x86_64) unknown`,
  },
  { value: "pi", label: "Pi", userAgent: "pi/1.6.1 (linux; node/v22.23.5; x64)" },
  { value: "omp", label: "Oh My Pi", userAgent: "omp/19.2.1" },
  {
    value: "claude",
    label: "Claude",
    userAgent: `claude-cli/${CLAUDE_CODE_CLIENT_VERSION} (external, cli)`,
  },
  {
    value: "deepseek-harness",
    label: "DeepSeek Harness",
    userAgent:
      "deepseek-harness/0.2.2-rc.5 (+https://github.com/deepseek-ai/deepseek-harness) dsh-profile/tui",
  },
] as const;

export const PROVIDER_USER_AGENT_PRESETS = presets;
type Preset = (typeof presets)[number]["value"];

export type ProviderUserAgentSetting = {
  enabled: boolean;
  preset: Preset | "custom";
  custom: string;
};

export function readProviderUserAgentSetting(userAgent = ""): ProviderUserAgentSetting {
  const preset = presets.find((option) => option.userAgent === userAgent);
  return {
    enabled: userAgent !== "",
    preset: preset?.value ?? (userAgent ? "custom" : "opencode"),
    custom: userAgent,
  };
}

export function getProviderUserAgent(setting: ProviderUserAgentSetting): string {
  if (!setting.enabled) return "";
  if (setting.preset === "custom") return setting.custom.trim();
  return presets.find((option) => option.value === setting.preset)?.userAgent ?? "";
}

export function isProviderUserAgentValid(setting: ProviderUserAgentSetting): boolean {
  if (!setting.enabled) return true;
  const userAgent = getProviderUserAgent(setting);
  return userAgent.length <= 1000 && /^[\x20-\x7e\x80-\xff]+$/.test(userAgent);
}
