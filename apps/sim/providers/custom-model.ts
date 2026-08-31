export const CUSTOM_PROVIDER_IDS = ['custom-openai', 'custom-anthropic'] as const

export type CustomProviderProtocolId = (typeof CUSTOM_PROVIDER_IDS)[number]

export interface ParsedCustomModelId {
  providerId: CustomProviderProtocolId
  customProviderId?: string
  modelId: string
}

export function normalizeModelId(modelId: string): string {
  return modelId.trim()
}

export function normalizeModelKey(modelId: string): string {
  return normalizeModelId(modelId).toLowerCase()
}

export function buildCustomModelId(
  providerId: CustomProviderProtocolId,
  customProviderId: string,
  modelId: string
): string {
  return `${providerId}/${encodeURIComponent(normalizeModelId(customProviderId))}/${encodeURIComponent(
    normalizeModelId(modelId)
  )}`
}

export function parseCustomModelId(modelId: string): ParsedCustomModelId | null {
  const normalized = normalizeModelId(modelId)
  const canonicalMatch = normalized.match(
    /^(custom-openai|custom-anthropic)\/([^/]+)\/(.+)$/i
  )
  if (canonicalMatch) {
    try {
      return {
        providerId: canonicalMatch[1].toLowerCase() as CustomProviderProtocolId,
        customProviderId: decodeURIComponent(canonicalMatch[2]),
        modelId: decodeURIComponent(canonicalMatch[3]),
      }
    } catch {
      return null
    }
  }

  const legacyMatch = normalized.match(/^(custom-openai|custom-anthropic)\/(.+)$/i)
  if (!legacyMatch) return null

  try {
    return {
      providerId: legacyMatch[1].toLowerCase() as CustomProviderProtocolId,
      modelId: decodeURIComponent(legacyMatch[2]),
    }
  } catch {
    return null
  }
}

export function isCustomModel(modelId: string): boolean {
  return parseCustomModelId(modelId) !== null
}
