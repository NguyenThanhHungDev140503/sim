import catalogJson from '@sim/deployment-config/model-catalog.json'

const PRICE_NUMBER_FORMAT_3 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
})

const PRICE_NUMBER_FORMAT_4 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

const UPDATED_AT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export interface PricingInfo {
  input: number
  cachedInput?: number
  output: number
  updatedAt: string
}

export interface CatalogFaq {
  question: string
  answer: string
}

export interface CapabilityFact {
  label: string
  value: string
}

export interface ModelCapabilities {
  temperature?: {
    min: number
    max: number
  }
  toolUsageControl?: boolean
  computerUse?: boolean
  nativeStructuredOutputs?: boolean
  maxOutputTokens?: number
  reasoningEffort?: {
    values: string[]
  }
  verbosity?: {
    values: string[]
  }
  promptCaching?: {
    minimumCacheableTokens: number
  }
  thinking?: {
    levels: string[]
    default?: string
    streamed?: 'full' | 'summary' | 'none'
  }
  deepResearch?: boolean
  memory?: boolean
}

export interface CatalogModel {
  id: string
  slug: string
  href: string
  displayName: string
  shortId: string
  providerId: string
  providerName: string
  providerSlug: string
  contextWindow: number | null
  releaseDate: string | null
  deprecated: boolean
  pricing: PricingInfo
  capabilities: ModelCapabilities
  capabilityTags: string[]
  summary: string
  bestFor?: string
  searchText: string
}

export interface CatalogProvider {
  id: string
  slug: string
  href: string
  name: string
  description: string
  summary: string
  defaultModel: string
  defaultModelDisplayName: string
  color?: string
  isReseller: boolean
  contextInformationAvailable: boolean
  maxFileAttachmentBytes: number | null
  providerCapabilityTags: string[]
  modelCount: number
  models: CatalogModel[]
  featuredModels: CatalogModel[]
  searchText: string
}

export function formatTokenCount(value?: number | null): string {
  if (value == null) {
    return 'Unknown'
  }

  if (value >= 1000000) {
    return `${trimTrailingZeros((value / 1000000).toFixed(2))}M`
  }

  if (value >= 1000) {
    return `${trimTrailingZeros((value / 1000).toFixed(0))}k`
  }

  return value.toLocaleString('en-US')
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes == null) {
    return 'Unknown'
  }

  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) {
    return `${trimTrailingZeros(gb.toFixed(1))}GB`
  }
  return `${Math.round(bytes / (1024 * 1024))}MB`
}

export function formatPrice(price?: number | null): string {
  if (price === undefined || price === null) {
    return 'N/A'
  }

  const formatter = price > 0 && price < 0.001 ? PRICE_NUMBER_FORMAT_4 : PRICE_NUMBER_FORMAT_3

  return `$${trimTrailingZeros(formatter.format(price))}`
}

export function formatUpdatedAt(date: string): string {
  try {
    return UPDATED_AT_DATE_FORMAT.format(new Date(date))
  } catch {
    return date
  }
}

function trimTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
}

export function formatCapabilityBoolean(value?: boolean): string {
  if (value === undefined) {
    return 'Not configurable'
  }
  return value ? 'Supported' : 'Not supported'
}

export function supportsCatalogStructuredOutputs(capabilities: ModelCapabilities): boolean {
  return Boolean(capabilities.nativeStructuredOutputs)
}

export function getEffectiveMaxOutputTokens(capabilities: ModelCapabilities): number | null {
  return capabilities.maxOutputTokens ?? null
}

const rawProviders: CatalogProvider[] = (catalogJson.providers as unknown as CatalogProvider[])

function assertUniqueGeneratedRoutes(providers: CatalogProvider[]): void {
  const seenProviderHrefs = new Map<string, string>()
  const seenModelHrefs = new Map<string, string>()

  for (const provider of providers) {
    const existingProvider = seenProviderHrefs.get(provider.href)
    if (existingProvider) {
      throw new Error(
        `Duplicate provider route detected: ${provider.href} for ${provider.id} and ${existingProvider}`
      )
    }
    seenProviderHrefs.set(provider.href, provider.id)

    for (const model of provider.models) {
      const existingModel = seenModelHrefs.get(model.href)
      if (existingModel) {
        throw new Error(
          `Duplicate model route detected: ${model.href} for ${model.id} and ${existingModel}`
        )
      }
      seenModelHrefs.set(model.href, model.id)
    }
  }
}

assertUniqueGeneratedRoutes(rawProviders)

export const MODEL_CATALOG_PROVIDERS: CatalogProvider[] = rawProviders
export const MODEL_PROVIDERS_WITH_CATALOGS = MODEL_CATALOG_PROVIDERS.filter(
  (provider) => provider.models.length > 0 && !provider.isReseller
)
export const MODEL_PROVIDERS_WITH_DYNAMIC_CATALOGS = MODEL_CATALOG_PROVIDERS.filter(
  (provider) => provider.models.length === 0
)
export const ALL_CATALOG_MODELS = MODEL_PROVIDERS_WITH_CATALOGS.flatMap(
  (provider) => provider.models
)
export const TOTAL_MODEL_PROVIDERS = MODEL_CATALOG_PROVIDERS.length
export const TOTAL_MODELS = ALL_CATALOG_MODELS.length
export const TOP_MODEL_PROVIDERS = MODEL_PROVIDERS_WITH_CATALOGS.slice(0, 8).map(
  (provider) => provider.name
)

export function getPricingBounds(pricing: PricingInfo): { lowPrice: number; highPrice: number } {
  return {
    lowPrice: Math.min(
      pricing.input,
      pricing.output,
      ...(pricing.cachedInput !== undefined ? [pricing.cachedInput] : [])
    ),
    highPrice: Math.max(pricing.input, pricing.output),
  }
}

export function getProviderBySlug(providerSlug: string): CatalogProvider | null {
  return MODEL_CATALOG_PROVIDERS.find((provider) => provider.slug === providerSlug) ?? null
}

export function getModelBySlug(providerSlug: string, modelSlug: string): CatalogModel | null {
  const provider = getProviderBySlug(providerSlug)
  if (!provider) {
    return null
  }

  return provider.models.find((model) => model.slug === modelSlug) ?? null
}

export function getRelatedModels(targetModel: CatalogModel, limit = 6): CatalogModel[] {
  const provider = MODEL_PROVIDERS_WITH_CATALOGS.find(
    (entry) => entry.id === targetModel.providerId
  )
  if (!provider) {
    return []
  }

  const targetTokens = new Set(
    targetModel.shortId
      .toLowerCase()
      .split(/[-_/\s]+/)
      .filter(Boolean)
  )

  const scored = provider.models.reduce<Array<{ model: CatalogModel; score: number }>>(
    (acc, model) => {
      if (model.id === targetModel.id) {
        return acc
      }

      const modelTokens = model.shortId
        .toLowerCase()
        .split(/[-_/\s]+/)
        .filter(Boolean)
      const sharedTokenCount = modelTokens.filter((token) => targetTokens.has(token)).length
      const sharedCapabilityCount = model.capabilityTags.filter((tag) =>
        targetModel.capabilityTags.includes(tag)
      ).length

      acc.push({
        model,
        score: sharedTokenCount * 2 + sharedCapabilityCount + (model.contextWindow ?? 0) / 1000000,
      })
      return acc
    },
    []
  )

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ model }) => model)
}

export function buildProviderFaqs(provider: CatalogProvider): CatalogFaq[] {
  const cheapestModel = getCheapestProviderModel(provider)
  const largestContextModel = getLargestContextProviderModel(provider)

  const toolUseModels = provider.models.filter(
    (m) =>
      m.capabilities.toolUsageControl !== undefined ||
      provider.providerCapabilityTags.includes('Tool Use')
  )

  const faqs: CatalogFaq[] = [
    {
      question: `What ${provider.name} models are available in Sim?`,
      answer: `Sim currently tracks ${provider.modelCount} ${provider.name} model${provider.modelCount === 1 ? '' : 's'} including ${provider.models
        .slice(0, 6)
        .map((model) => model.displayName)
        .join(', ')}${provider.modelCount > 6 ? ', and more' : ''}.`,
    },
    {
      question: `What is the default ${provider.name} model in Sim?`,
      answer: provider.defaultModel
        ? `${provider.defaultModelDisplayName} is the default ${provider.name} model in Sim.`
        : `${provider.name} does not have a fixed default model in the public catalog because models are loaded dynamically.`,
    },
    {
      question: `What is the cheapest ${provider.name} model tracked in Sim?`,
      answer: cheapestModel
        ? `${cheapestModel.displayName} currently has the lowest listed input price at ${formatPrice(
            cheapestModel.pricing.input
          )}/1M tokens.`
        : `Sim does not currently expose a fixed public pricing table for ${provider.name} models on this page.`,
    },
    {
      question: `Which ${provider.name} model has the largest context window?`,
      answer: largestContextModel?.contextWindow
        ? `${largestContextModel.displayName} currently has the largest listed context window at ${formatTokenCount(
            largestContextModel.contextWindow
          )} tokens.`
        : `Context window details are not fully available for every ${provider.name} model in the public catalog.`,
    },
  ]

  if (toolUseModels.length > 0) {
    faqs.push({
      question: `Which ${provider.name} models support tool use and function calling in Sim?`,
      answer:
        toolUseModels.length === provider.modelCount
          ? `All ${provider.name} models in Sim support tool use and function calling, allowing agents to invoke external APIs, query databases, and run custom actions.`
          : `${toolUseModels
              .slice(0, 5)
              .map((m) => m.displayName)
              .join(
                ', '
              )}${toolUseModels.length > 5 ? ', and others' : ''} support tool use and function calling in Sim, enabling agents to invoke external APIs and run custom actions.`,
    })
  }

  return faqs
}

export function buildModelFaqs(provider: CatalogProvider, model: CatalogModel): CatalogFaq[] {
  const faqs: CatalogFaq[] = [
    {
      question: `What is ${model.displayName}?`,
      answer: `${model.displayName} is a ${provider.name} model available in Sim. ${model.summary}`,
    },
    {
      question: `How much does ${model.displayName} cost?`,
      answer: `${model.displayName} is listed at ${formatPrice(model.pricing.input)}/1M input tokens${model.pricing.cachedInput !== undefined ? `, ${formatPrice(model.pricing.cachedInput)}/1M cached input tokens` : ''}, and ${formatPrice(model.pricing.output)}/1M output tokens.`,
    },
    {
      question: `What is the context window for ${model.displayName}?`,
      answer: model.contextWindow
        ? `${model.displayName} supports a context window of ${formatTokenCount(model.contextWindow)} tokens in Sim. In an agent, this determines how much conversation history, tool outputs, and retrieved documents the model can hold in a single call.`
        : `A public context window value is not currently tracked for ${model.displayName}.`,
    },
    {
      question: `What capabilities does ${model.displayName} support?`,
      answer:
        model.capabilityTags.length > 0
          ? `${model.displayName} supports the following capabilities in Sim: ${model.capabilityTags.join(', ')}.`
          : `${model.displayName} supports standard text generation in Sim. No additional capability flags such as tool use or structured outputs are currently tracked for this model.`,
    },
  ]

  if (model.bestFor) {
    faqs.push({
      question: `What is ${model.displayName} best used for?`,
      answer: `${model.bestFor} When used in a Sim workflow, it can be selected in any Agent block from the model picker.`,
    })
  }

  return faqs
}

export function buildModelCapabilityFacts(model: CatalogModel): CapabilityFact[] {
  const { capabilities } = model
  const supportsStructuredOutputs = supportsCatalogStructuredOutputs(capabilities)

  return [
    {
      label: 'Temperature',
      value: capabilities.temperature
        ? `${capabilities.temperature.min} to ${capabilities.temperature.max}`
        : 'Not configurable',
    },
    {
      label: 'Reasoning effort',
      value: capabilities.reasoningEffort
        ? capabilities.reasoningEffort.values.join(', ')
        : 'Not supported',
    },
    {
      label: 'Verbosity',
      value: capabilities.verbosity ? capabilities.verbosity.values.join(', ') : 'Not supported',
    },
    {
      label: 'Thinking levels',
      value: capabilities.thinking
        ? `${capabilities.thinking.levels.join(', ')}${
            capabilities.thinking.default ? ` (default: ${capabilities.thinking.default})` : ''
          }`
        : 'Not supported',
    },
    {
      label: 'Structured outputs',
      value: supportsStructuredOutputs
        ? capabilities.nativeStructuredOutputs
          ? 'Supported (native)'
          : 'Supported'
        : 'Not supported',
    },
    {
      label: 'Tool choice',
      value: formatCapabilityBoolean(capabilities.toolUsageControl),
    },
    {
      label: 'Computer use',
      value: formatCapabilityBoolean(capabilities.computerUse),
    },
    {
      label: 'Deep research',
      value: formatCapabilityBoolean(capabilities.deepResearch),
    },
    {
      label: 'Memory support',
      value: capabilities.memory === false ? 'Disabled' : 'Supported',
    },
    {
      label: 'Max output tokens',
      value: capabilities.maxOutputTokens
        ? formatTokenCount(getEffectiveMaxOutputTokens(capabilities))
        : 'Not published',
    },
  ]
}

export function getCheapestProviderModel(provider: CatalogProvider): CatalogModel | null {
  if (provider.models.length === 0) return null
  return provider.models.reduce((min, m) => (m.pricing.input < min.pricing.input ? m : min))
}

export function getLargestContextProviderModel(provider: CatalogProvider): CatalogModel | null {
  if (provider.models.length === 0) return null
  return provider.models.reduce((max, m) =>
    (m.contextWindow ?? 0) > (max.contextWindow ?? 0) ? m : max
  )
}
