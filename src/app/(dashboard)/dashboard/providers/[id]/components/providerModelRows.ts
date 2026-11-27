import type { ProviderSpecialtyModel } from "@/lib/providerModels/providerSpecialtyModels";
import { isFreeModel, sortModelsFreeFirst } from "@/shared/utils/freeModels";
import { matchesModelCatalogQuery } from "@/shared/utils/modelCatalogSearch";

type Visibility = { id: string; isHidden: boolean; specialty?: ProviderSpecialtyModel };
type CatalogRow<T> = Visibility & { key: string; isFree: boolean } & (
    { model: T; specialty?: never } | { specialty: ProviderSpecialtyModel; model?: never }
  );

export function filterProviderModelRows<T extends { isHidden: boolean; isFree: boolean }>({
  allModels,
  filteredModels,
  specialtyModels,
  providerId,
  modelFilter,
  visibilityFilter,
  freeFilter,
  sortFreeFirst,
  getId,
}: {
  allModels: T[];
  filteredModels: T[];
  specialtyModels: ProviderSpecialtyModel[];
  providerId: string;
  modelFilter: string;
  visibilityFilter: "all" | "visible" | "hidden";
  freeFilter: "all" | "free" | "paid";
  sortFreeFirst: boolean;
  getId: (model: T) => string;
}) {
  const rows = filteredModels.map((model): CatalogRow<T> => {
    const id = getId(model);
    return { id, key: id, isHidden: model.isHidden, isFree: model.isFree, model };
  });
  let activeCount = allModels.filter((model) => !model.isHidden).length;
  for (const specialty of specialtyModels) {
    if (!specialty.isHidden) activeCount++;
    const { modelId: id, isHidden, type, fullModel, name, source } = specialty;
    if (visibilityFilter !== "all" && isHidden !== (visibilityFilter === "hidden")) continue;
    if (
      !matchesModelCatalogQuery(modelFilter, {
        modelId: fullModel,
        modelName: name,
        alias: type,
        source,
      })
    ) {
      continue;
    }
    const isFree = isFreeModel(providerId, { id });
    if (freeFilter !== "all" && isFree !== (freeFilter === "free")) continue;
    rows.push({ id, key: `${type}/${fullModel}`, isHidden, isFree, specialty });
  }
  return {
    displayRows: sortFreeFirst
      ? sortModelsFreeFirst(rows, { isFree: (row) => row.isFree, key: (row) => row.id })
      : rows,
    activeCount,
    totalCount: allModels.length + specialtyModels.length,
    hiddenFilteredCount: rows.filter((row) => row.isHidden).length,
  };
}

export async function toggleProviderModelRows(
  rows: Visibility[],
  hidden: boolean,
  toggle: (ids: string[], hidden: boolean, modality?: string) => Promise<void>
) {
  const groups = new Map<string | undefined, Set<string>>();
  for (const row of rows) {
    if (row.isHidden === hidden) continue;
    const modality = row.specialty?.modality;
    let ids = groups.get(modality);
    if (!ids) groups.set(modality, (ids = new Set()));
    ids.add(row.id);
  }
  for (const [modality, ids] of groups) {
    if (modality === undefined) await toggle([...ids], hidden);
    else await toggle([...ids], hidden, modality);
  }
}
