import { getAllImageModels, parseImageModel } from "@omniroute/open-sse/config/imageRegistry";
import { getAllEmbeddingModels } from "@omniroute/open-sse/config/embeddingRegistry";
import { getAllRerankModels } from "@omniroute/open-sse/config/rerankRegistry";
import { getAllAudioModels } from "@omniroute/open-sse/config/audioRegistry";
import { getAllModerationModels } from "@omniroute/open-sse/config/moderationRegistry";
import { getAllVideoModels, parseVideoModel } from "@omniroute/open-sse/config/videoRegistry";
import { getAllMusicModels, parseMusicModel } from "@omniroute/open-sse/config/musicRegistry";
import { getAllOcrModels } from "@omniroute/open-sse/config/ocrRegistry";
import { getModelsByProviderId } from "@/shared/constants/models";
import { normalizeModelSupportedEndpoints } from "@/shared/constants/modelSupportedEndpoints";
import { getHiddenModelsByProvider } from "@/lib/db/models";
import { getActiveSyncedCatalog } from "@/lib/db/models/activeSyncedCatalog";
import { getCachedProviderNodes } from "@/lib/db/readCache";

export type ProviderSpecialtyModel = {
  id: string;
  modelId: string;
  fullModel: string;
  name: string;
  type: string;
  modality: string;
  source: string;
  isHidden: boolean;
};

export async function getProviderSpecialtyModels(
  provider: string,
  customModels: Array<{
    id?: string;
    name?: string;
    supportedEndpoints?: string[];
    source?: string;
  }>
): Promise<ProviderSpecialtyModel[]> {
  const rows = new Map<string, ProviderSpecialtyModel>();
  const hiddenByModality = new Map<string, Set<string>>();
  const add = (
    fullModel: string,
    modelId: string,
    name: string,
    type: string,
    modality: string,
    source: string
  ) => {
    const key = `${type}\0${modelId}`;
    if (rows.has(key)) return;
    let hidden = hiddenByModality.get(modality);
    if (!hidden) {
      hidden = getHiddenModelsByProvider(modality).get(provider) || new Set<string>();
      hiddenByModality.set(modality, hidden);
    }
    rows.set(key, {
      id: fullModel.startsWith(`${provider}/`) ? fullModel.slice(provider.length + 1) : fullModel,
      modelId,
      fullModel,
      name,
      type,
      modality,
      source,
      isHidden: hidden.has(modelId),
    });
  };
  const catalogs = [
    { models: getAllImageModels(), type: "image", modality: "images", parse: parseImageModel },
    { models: getAllEmbeddingModels(), type: "embedding", modality: "embeddings" },
    { models: getAllRerankModels(), type: "rerank", modality: "rerank" },
    { models: getAllAudioModels(), type: "audio", modality: "audio" },
    { models: getAllModerationModels(), type: "moderation", modality: "moderation" },
    { models: getAllVideoModels(), type: "video", modality: "videos", parse: parseVideoModel },
    { models: getAllMusicModels(), type: "music", modality: "music", parse: parseMusicModel },
    { models: getAllOcrModels(), type: "ocr", modality: "ocr" },
  ];
  for (const catalog of catalogs) {
    for (const model of catalog.models) {
      if (model.provider !== provider) continue;
      const modelId = catalog.parse
        ? catalog.parse(model.id).model
        : model.id.startsWith(`${provider}/`)
          ? model.id.slice(provider.length + 1)
          : model.id;
      if (!modelId) continue;
      const type = "subtype" in model ? `audio-${model.subtype}` : catalog.type;
      add(model.id, modelId, model.name, type, catalog.modality, "system");
    }
  }
  const synced = await getActiveSyncedCatalog(provider, false);
  const nodes = await getCachedProviderNodes();
  const prefix = nodes.find((node) => node.id === provider)?.prefix || provider;
  const endpointTypes: Record<string, [string, string]> = {
    embeddings: ["embedding", "embeddings"],
    images: ["image", "images"],
    "images-generations": ["image", "images"],
    "audio-speech": ["audio-speech", "audio"],
    "audio-transcriptions": ["audio-transcription", "audio"],
    videos: ["video", "videos"],
  };
  for (const { models, source } of [
    { models: getModelsByProviderId(provider), source: "system" },
    { models: synced.models, source: "imported" },
    { models: customModels, source: "custom" },
  ]) {
    for (const model of models) {
      if (!model.id) continue;
      for (const endpoint of normalizeModelSupportedEndpoints(model.supportedEndpoints || [])) {
        if (endpoint === "chat" || endpoint === "responses") continue;
        const [type, modality] = endpointTypes[endpoint] || [endpoint, endpoint];
        add(`${prefix}/${model.id}`, model.id, model.name || model.id, type, modality, source);
      }
    }
  }
  return [...rows.values()];
}
