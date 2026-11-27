type ProviderSpecificDataLike = { customHeaders?: unknown };

export function resolveConnectionUpstreamOverrides(
  providerSpecificData: ProviderSpecificDataLike | null | undefined
): {
  connectionCustomHeaders: Record<string, string> | undefined;
} {
  const connectionCustomHeaders =
    providerSpecificData &&
    typeof providerSpecificData === "object" &&
    typeof providerSpecificData.customHeaders === "object" &&
    !Array.isArray(providerSpecificData.customHeaders)
      ? (providerSpecificData.customHeaders as Record<string, string>)
      : undefined;
  return { connectionCustomHeaders };
}
