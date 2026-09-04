import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slugify } from '@sim/utils/string'
import { PROVIDER_DEFINITIONS, type ModelCapabilities } from '../apps/sim/providers/models'

const currentDir = fileURLToPath(new URL('.', import.meta.url))
const outputPath = resolve(currentDir, '../packages/deployment-config/model-catalog.json')

const PROVIDER_PREFIXES: Record<string, string[]> = {
  'azure-openai': ['azure/'],
  'azure-anthropic': ['azure-anthropic/'],
  vertex: ['vertex/'],
  bedrock: ['bedrock/'],
  cerebras: ['cerebras/'],
  fireworks: ['fireworks/'],
  together: ['together/'],
  baseten: ['baseten/'],
  'ollama-cloud': ['ollama-cloud/'],
  groq: ['groq/'],
  openrouter: ['openrouter/'],
  vllm: ['vllm/'],
}

const TOKEN_REPLACEMENTS: Record<string, string> = {
  ai: 'AI',
  aws: 'AWS',
  gpt: 'GPT',
  oss: 'OSS',
  llm: 'LLM',
  xai: 'xAI',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure: 'Azure',
  gemini: 'Gemini',
  vertex: 'Vertex',
  groq: 'Groq',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  cerebras: 'Cerebras',
  ollama: 'Ollama',
  bedrock: 'Bedrock',
  google: 'Google',
  moonshotai: 'Moonshot AI',
  qwen: 'Qwen',
  glm: 'GLM',
  kimi: 'Kimi',
  nova: 'Nova',
  llama: 'Llama',
  meta: 'Meta',
  cohere: 'Cohere',
  amazon: 'Amazon',
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  flash: 'Flash',
  preview: 'Preview',
  latest: 'Latest',
  mini: 'Mini',
  nano: 'Nano',
  pro: 'Pro',
  plus: 'Plus',
  plusplus: 'PlusPlus',
  code: 'Code',
  codex: 'Codex',
  instant: 'Instant',
  versatile: 'Versatile',
  instruct: 'Instruct',
  guard: 'Guard',
  safeguard: 'Safeguard',
  medium: 'Medium',
  small: 'Small',
  large: 'Large',
  lite: 'Lite',
  premier: 'Premier',
  premierer: 'Premier',
  micro: 'Micro',
  reasoning: 'Reasoning',
  non: 'Non',
  distill: 'Distill',
  chat: 'Chat',
  text: 'Text',
  embedding: 'Embedding',
  router: 'Router',
}

const PRICE_NUMBER_FORMAT_3 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
})

const PRICE_NUMBER_FORMAT_4 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

export interface PricingInfo {
  input: number
  cachedInput?: number
  output: number
  updatedAt: string
}

export interface SerializedCatalogModel {
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

export interface SerializedCatalogProvider {
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
  models: SerializedCatalogModel[]
  featuredModels: SerializedCatalogModel[]
  searchText: string
}

export interface SerializedModelCatalog {
  providers: SerializedCatalogProvider[]
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
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

export function formatPrice(price?: number | null): string {
  if (price === undefined || price === null) {
    return 'N/A'
  }

  const formatter = price > 0 && price < 0.001 ? PRICE_NUMBER_FORMAT_4 : PRICE_NUMBER_FORMAT_3

  return `$${trimTrailingZeros(formatter.format(price))}`
}

function supportsCatalogStructuredOutputs(capabilities: ModelCapabilities): boolean {
  return !capabilities.deepResearch
}

function getProviderPrefixes(providerId: string): string[] {
  return PROVIDER_PREFIXES[providerId] ?? [`${providerId}/`]
}

function stripProviderPrefix(providerId: string, modelId: string): string {
  for (const prefix of getProviderPrefixes(providerId)) {
    if (modelId.startsWith(prefix)) {
      return modelId.slice(prefix.length)
    }
  }

  return modelId
}

function stripTechnicalSuffixes(value: string): string {
  return value
    .replace(/-\d{8}-v\d+:\d+$/i, '')
    .replace(/-v\d+:\d+$/i, '')
    .replace(/-\d{8}$/i, '')
}

function tokenizeModelName(value: string): string[] {
  return value
    .replace(/[./:_]+/g, '-')
    .split('-')
    .filter(Boolean)
}

function mergeVersionTokens(tokens: string[]): string[] {
  const merged: string[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]
    const next = tokens[index + 1]

    if (/^\d{1,2}$/.test(current) && /^\d{1,2}$/.test(next)) {
      merged.push(`${current}.${next}`)
      index += 1
      continue
    }

    merged.push(current)
  }

  return merged
}

function formatModelToken(token: string): string {
  const normalized = token.toLowerCase()

  if (TOKEN_REPLACEMENTS[normalized]) {
    return TOKEN_REPLACEMENTS[normalized]
  }

  if (/^\d+b$/i.test(token)) {
    return `${token.slice(0, -1)}B`
  }

  if (/^\d+e$/i.test(token)) {
    return `${token.slice(0, -1)}E`
  }

  if (/^o\d+$/i.test(token)) {
    return token.toLowerCase()
  }

  if (/^r\d+$/i.test(token)) {
    return token.toUpperCase()
  }

  if (/^v\d+$/i.test(token)) {
    return token.toUpperCase()
  }

  if (/^\d+\.\d+$/.test(token)) {
    return token
  }

  if (/^[a-z]{3,}\d+$/i.test(token)) {
    const [, prefix, version] = token.match(/^([a-z]{3,})(\d+)$/i) ?? []
    if (prefix && version) {
      return `${formatModelToken(prefix)} ${version}`
    }
  }

  if (/^[a-z]\d+[a-z]$/i.test(token)) {
    return token.toUpperCase()
  }

  if (/^\d+$/.test(token)) {
    return token
  }

  return token.charAt(0).toUpperCase() + token.slice(1)
}

function formatModelDisplayName(providerId: string, modelId: string): string {
  const shortId = stripProviderPrefix(providerId, modelId)
  const normalized = stripTechnicalSuffixes(shortId)
  const tokens = mergeVersionTokens(tokenizeModelName(normalized))

  const displayName = tokens
    .map(formatModelToken)
    .join(' ')
    .split(/\s+/)
    .filter(
      (word, index, words) => index === 0 || word.toLowerCase() !== words[index - 1].toLowerCase()
    )
    .join(' ')

  return displayName.replace(/^GPT (\d[\w.]*)/i, 'GPT-$1').replace(/\bGpt\b/g, 'GPT')
}

function buildCapabilityTags(capabilities: ModelCapabilities): string[] {
  const tags: string[] = []

  if (capabilities.temperature) {
    tags.push(`Temperature ${capabilities.temperature.min}-${capabilities.temperature.max}`)
  }

  if (capabilities.toolUsageControl) {
    tags.push('Tool choice')
  }

  if (supportsCatalogStructuredOutputs(capabilities)) {
    tags.push('Structured outputs')
  }

  if (capabilities.computerUse) {
    tags.push('Computer use')
  }

  if (capabilities.deepResearch) {
    tags.push('Deep research')
  }

  if (capabilities.reasoningEffort) {
    tags.push(`Reasoning ${capabilities.reasoningEffort.values.join(', ')}`)
  }

  if (capabilities.verbosity) {
    tags.push(`Verbosity ${capabilities.verbosity.values.join(', ')}`)
  }

  if (capabilities.thinking) {
    tags.push(`Thinking ${capabilities.thinking.levels.join(', ')}`)
  }

  if (capabilities.maxOutputTokens) {
    tags.push(`Max output ${formatTokenCount(capabilities.maxOutputTokens)}`)
  }

  if (capabilities.memory === false) {
    tags.push('Memory off')
  }

  return tags
}

function buildBestForLine(model: {
  pricing: PricingInfo
  capabilities: ModelCapabilities
  contextWindow: number | null
}): string | null {
  const { pricing, capabilities, contextWindow } = model

  if (capabilities.deepResearch) {
    return 'Best for multi-step research workflows and agent-led web investigation.'
  }

  if (capabilities.reasoningEffort || capabilities.thinking) {
    return 'Best for reasoning-heavy tasks that need more deliberate model control.'
  }

  if (contextWindow && contextWindow >= 1000000) {
    return 'Best for long-context retrieval, large documents, and high-memory workflows.'
  }

  if (capabilities.nativeStructuredOutputs) {
    return 'Best for production workflows that need reliable typed outputs.'
  }

  if (pricing.input <= 0.2 && pricing.output <= 1.25) {
    return 'Best for cost-sensitive automations, background tasks, and high-volume workloads.'
  }

  return null
}

function buildModelSummary(
  providerName: string,
  displayName: string,
  pricing: PricingInfo,
  contextWindow: number | null,
  capabilityTags: string[]
): string {
  const parts = [
    `${displayName} is a ${providerName} model tracked in Sim.`,
    contextWindow ? `It supports a ${formatTokenCount(contextWindow)} token context window.` : null,
    `Pricing starts at ${formatPrice(pricing.input)}/1M input tokens and ${formatPrice(pricing.output)}/1M output tokens.`,
    capabilityTags.length > 0
      ? `Key capabilities include ${capabilityTags.slice(0, 3).join(', ')}.`
      : null,
  ]

  return parts.filter(Boolean).join(' ')
}

function computeModelRelevanceScore(model: SerializedCatalogModel): number {
  return (
    (model.capabilities.reasoningEffort ? 10 : 0) +
    (model.capabilities.thinking ? 10 : 0) +
    (model.capabilities.deepResearch ? 8 : 0) +
    (model.capabilities.nativeStructuredOutputs ? 4 : 0) +
    (model.contextWindow ?? 0) / 100000
  )
}

function compareModelsByRelevance(a: SerializedCatalogModel, b: SerializedCatalogModel): number {
  return computeModelRelevanceScore(b) - computeModelRelevanceScore(a)
}

function assertUniqueGeneratedRoutes(providers: SerializedCatalogProvider[]): void {
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

export function generateModelCatalog(): SerializedModelCatalog {
  const rawProviders: SerializedCatalogProvider[] = Object.values(PROVIDER_DEFINITIONS).map(
    (provider) => {
      const providerSlug = slugify(provider.id)
      const providerDisplayName = provider.name
      const providerCapabilityTags = buildCapabilityTags(provider.capabilities ?? {})

      const models: SerializedCatalogModel[] = provider.models.map((model) => {
        const shortId = stripProviderPrefix(provider.id, model.id)
        const mergedCapabilities = { ...provider.capabilities, ...model.capabilities }
        const capabilityTags = buildCapabilityTags(mergedCapabilities)
        const bestFor = buildBestForLine({
          pricing: model.pricing,
          capabilities: mergedCapabilities,
          contextWindow: model.contextWindow ?? null,
        })
        const displayName = formatModelDisplayName(provider.id, model.id)
        const modelSlug = slugify(shortId)
        const href = `/models/${providerSlug}/${modelSlug}`

        return {
          id: model.id,
          slug: modelSlug,
          href,
          displayName,
          shortId,
          providerId: provider.id,
          providerName: providerDisplayName,
          providerSlug,
          contextWindow: model.contextWindow ?? null,
          releaseDate: model.releaseDate ?? null,
          deprecated: !!model.sunset,
          pricing: model.pricing,
          capabilities: mergedCapabilities,
          capabilityTags,
          summary: buildModelSummary(
            providerDisplayName,
            displayName,
            model.pricing,
            model.contextWindow ?? null,
            capabilityTags
          ),
          ...(bestFor ? { bestFor } : {}),
          searchText: [
            provider.name,
            providerDisplayName,
            provider.id,
            provider.description,
            model.id,
            shortId,
            displayName,
            capabilityTags.join(' '),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        }
      })

      const defaultModelDisplayName =
        models.find((model) => model.id === provider.defaultModel)?.displayName ||
        (provider.defaultModel
          ? formatModelDisplayName(provider.id, provider.defaultModel)
          : 'Dynamic')

      const featuredModels = [...models].sort(compareModelsByRelevance).slice(0, 6)

      return {
        id: provider.id,
        slug: providerSlug,
        href: `/models/${providerSlug}`,
        name: providerDisplayName,
        description: provider.description,
        summary: `${providerDisplayName} has ${models.length} tracked model${models.length === 1 ? '' : 's'} in Sim with pricing, context window, and capability metadata.`,
        defaultModel: provider.defaultModel,
        defaultModelDisplayName,
        color: provider.color,
        isReseller: provider.isReseller ?? false,
        contextInformationAvailable: provider.contextInformationAvailable !== false,
        maxFileAttachmentBytes: provider.fileAttachment?.maxBytes ?? null,
        providerCapabilityTags,
        modelCount: models.length,
        models,
        featuredModels,
        searchText: [
          provider.name,
          provider.id,
          provider.description,
          provider.defaultModel,
          defaultModelDisplayName,
          providerCapabilityTags.join(' '),
          models.map((model) => model.displayName).join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      }
    }
  )

  assertUniqueGeneratedRoutes(rawProviders)

  return {
    providers: rawProviders,
  }
}

function main() {
  const isCheck = process.argv.includes('--check')
  const catalog = generateModelCatalog()
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`

  if (isCheck) {
    let existing = ''
    try {
      existing = readFileSync(outputPath, 'utf8')
    } catch {
      console.error(`Artifact missing: ${outputPath}`)
      process.exit(1)
    }

    if (existing !== serialized) {
      console.error(
        'Model catalog artifact is out of sync with PROVIDER_DEFINITIONS. Run "bun run model-catalog:generate" to update it.'
      )
      process.exit(1)
    }
    console.log('Model catalog artifact is up to date.')
    return
  }

  writeFileSync(outputPath, serialized, 'utf8')
  console.log(`Generated model catalog artifact at ${outputPath}`)
}

if (import.meta.main) {
  main()
}
