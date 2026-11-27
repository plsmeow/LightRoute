"use client";

import { useTranslations } from "next-intl";
import { Input, Select, Toggle } from "@/shared/components";
import {
  PROVIDER_USER_AGENT_PRESETS,
  type ProviderUserAgentSetting,
} from "@/shared/constants/providerUserAgentPresets";
import { providerText } from "../[id]/providerPageHelpers";

export default function ProviderUserAgentFields({
  value,
  onChange,
}: {
  value: ProviderUserAgentSetting;
  onChange: (value: ProviderUserAgentSetting) => void;
}) {
  const t = useTranslations("providers");
  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={providerText(t, "changeUserAgent", "Change User-Agent")}
        description={providerText(
          t,
          "changeUserAgentHint",
          "When off, forward the original User-Agent. This applies to every key for this provider."
        )}
        checked={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />
      {value.enabled && (
        <>
          <Select
            label={providerText(t, "userAgentPreset", "User-Agent preset")}
            options={[
              ...PROVIDER_USER_AGENT_PRESETS,
              { value: "custom", label: providerText(t, "userAgentCustom", "Custom") },
            ]}
            value={value.preset}
            onChange={(event) => {
              const preset = PROVIDER_USER_AGENT_PRESETS.find(
                (option) => option.value === event.target.value
              );
              onChange({ ...value, preset: preset?.value ?? "custom" });
            }}
          />
          {value.preset === "custom" && (
            <Input
              label="User-Agent"
              value={value.custom}
              onChange={(event) => onChange({ ...value, custom: event.target.value })}
              maxLength={1000}
              placeholder="my-client/1.0"
            />
          )}
        </>
      )}
    </div>
  );
}
