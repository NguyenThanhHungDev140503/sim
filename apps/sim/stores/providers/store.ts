import { createLogger } from '@sim/logger'
import { create } from 'zustand'
import type { CustomProvider } from '@/lib/api/contracts/custom-providers'
import {
  buildCustomModelId,
  normalizeAndDedupeModelIds,
  normalizeModelKey,
} from '@/providers/custom-model'
import { PROVIDER_DEFINITIONS } from '@/providers/models'
import type { CustomProviderModel, OpenRouterModelInfo, ProvidersStore } from './types'

const logger = createLogger('ProvidersStore')

export const useProvidersStore = create<ProvidersStore>((set, get) => ({
  providers: {
    base: { models: [], isLoading: false },
    ollama: { models: [], isLoading: false },
    'ollama-cloud': { models: [], isLoading: false },
    vllm: { models: [], isLoading: false },
    litellm: { models: [], isLoading: false },
    openrouter: { models: [], isLoading: false },
    fireworks: { models: [], isLoading: false },
    together: { models: [], isLoading: false },
    baseten: { models: [], isLoading: false },
    'custom-openai': { models: [], isLoading: false },
    'custom-anthropic': { models: [], isLoading: false },
  },
  customProviderModels: {},
  customProviderModelsWorkspaceId: undefined,
  openRouterModelInfo: {},

  setProviderModels: (provider, models) => {
    logger.info(`Updated ${provider} models`, { count: models.length })
    set((state) => ({
      providers: {
        ...state.providers,
        [provider]: {
          ...state.providers[provider],
          models,
        },
      },
    }))
  },

  setCustomProviderModels: (models: CustomProviderModel[], workspaceId?: string) => {
    if (
      workspaceId !== undefined &&
      get().customProviderModelsWorkspaceId !== workspaceId
    ) {
      return
    }

    const customProviderModels = Object.fromEntries(
      models.filter(
        (model, index, allModels) =>
          allModels.findIndex(
            (candidate) => normalizeModelKey(candidate.id) === normalizeModelKey(model.id)
          ) === index
      ).map((model) => [model.id, model])
    )
    const uniqueModels = Object.values(customProviderModels)
    const customModelsByProvider = {
      'custom-openai': uniqueModels
        .filter((model) => model.providerId === 'custom-openai')
        .map((model) => model.id),
      'custom-anthropic': uniqueModels
        .filter((model) => model.providerId === 'custom-anthropic')
        .map((model) => model.id),
    }

    PROVIDER_DEFINITIONS['custom-openai'].models = customModelsByProvider['custom-openai'].map(
      (id) => ({
        id,
        pricing: { input: 0, output: 0, updatedAt: new Date().toISOString().split('T')[0] },
        capabilities: {},
      })
    )
    PROVIDER_DEFINITIONS['custom-anthropic'].models = customModelsByProvider[
      'custom-anthropic'
    ].map((id) => ({
      id,
      pricing: { input: 0, output: 0, updatedAt: new Date().toISOString().split('T')[0] },
      capabilities: {},
    }))

    logger.info('Updated custom provider models', { count: models.length })
    set((state) => ({
      customProviderModels,
      customProviderModelsWorkspaceId: workspaceId ?? state.customProviderModelsWorkspaceId,
      providers: {
        ...state.providers,
        'custom-openai': {
          ...state.providers['custom-openai'],
          models: customModelsByProvider['custom-openai'],
        },
        'custom-anthropic': {
          ...state.providers['custom-anthropic'],
          models: customModelsByProvider['custom-anthropic'],
        },
      },
    }))
  },

  resetCustomProviderModels: (workspaceId?: string) => {
    PROVIDER_DEFINITIONS['custom-openai'].models = []
    PROVIDER_DEFINITIONS['custom-anthropic'].models = []
    set((state) => ({
      customProviderModels: {},
      customProviderModelsWorkspaceId: workspaceId,
      providers: {
        ...state.providers,
        'custom-openai': { ...state.providers['custom-openai'], models: [] },
        'custom-anthropic': { ...state.providers['custom-anthropic'], models: [] },
      },
    }))
  },

  setProviderLoading: (provider, isLoading) => {
    set((state) => ({
      providers: {
        ...state.providers,
        [provider]: {
          ...state.providers[provider],
          isLoading,
        },
      },
    }))
  },

  setOpenRouterModelInfo: (modelInfo: Record<string, OpenRouterModelInfo>) => {
    const structuredOutputCount = Object.values(modelInfo).filter(
      (m) => m.supportsStructuredOutputs
    ).length
    logger.info('Updated OpenRouter model info', {
      count: Object.keys(modelInfo).length,
      withStructuredOutputs: structuredOutputCount,
    })
    set({ openRouterModelInfo: modelInfo })
  },

  getProvider: (provider) => {
    return get().providers[provider]
  },

  getCustomProviderModel: (modelId: string) => {
    const models = get().customProviderModels
    return models[modelId] ?? Object.values(models).find((model) => normalizeModelKey(model.id) === normalizeModelKey(modelId))
  },

  getOpenRouterModelInfo: (modelId: string) => {
    return get().openRouterModelInfo[modelId]
  },
}))

export function createCustomProviderModels(providers: CustomProvider[]): CustomProviderModel[] {
  return providers.flatMap((provider) => {
    const providerId = provider.protocol === 'anthropic' ? 'custom-anthropic' : 'custom-openai'
    return normalizeAndDedupeModelIds(provider.models).models.map((model) => ({
      id: buildCustomModelId(providerId, provider.id, model),
      label: `${provider.name} / ${model.trim()}`,
      providerId,
      customProviderId: provider.id,
      customProviderName: provider.name,
      endpoint: provider.baseUrl,
      hasApiKey: provider.hasApiKey,
    }))
  })
}
