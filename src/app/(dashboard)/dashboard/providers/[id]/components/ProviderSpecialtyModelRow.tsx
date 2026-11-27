"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components";
import type { ProviderSpecialtyModel } from "@/lib/providerModels/providerSpecialtyModels";
import type { ProviderMessageTranslator } from "../providerPageHelpers";
import { ModelSourceBadge } from "./ModelRow";

export default function ProviderSpecialtyModelRow({
  model,
  copied,
  onCopy,
  onToggleHidden,
  disabled,
  t,
}: {
  model: ProviderSpecialtyModel;
  copied?: string | null;
  onCopy: (text: string, key: string) => void;
  onToggleHidden: (modelId: string, hidden: boolean, modality: string) => Promise<void>;
  disabled: boolean;
  t: ProviderMessageTranslator;
}) {
  const mediaText = useTranslations("media");
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 rounded-lg border border-border px-3 py-2 ${model.isHidden ? "opacity-50" : ""}`}
    >
      <code className="break-all font-mono text-xs text-text-main">{model.fullModel}</code>
      <div className="flex min-w-0 items-center gap-2">
        <ModelSourceBadge source={model.source} />
        <span className="text-xs text-primary capitalize">
          {mediaText.has(model.type) ? mediaText(model.type) : model.type}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-text-muted" title={model.name}>
          {model.name}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          icon={copied === `${model.type}-${model.id}` ? "check" : "content_copy"}
          onClick={() => onCopy(model.fullModel, `${model.type}-${model.id}`)}
          title={t("copyModel")}
          aria-label={t("copyModel")}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          icon={model.isHidden ? "visibility_off" : "visibility"}
          onClick={() => void onToggleHidden(model.modelId, !model.isHidden, model.modality)}
          disabled={disabled}
          title={t(model.isHidden ? "showModel" : "hideModel")}
          aria-label={t(model.isHidden ? "showModel" : "hideModel")}
        />
      </div>
    </div>
  );
}
