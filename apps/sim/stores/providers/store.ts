import { createLogger } from '@sim/logger'
import { create } from 'zustand'
import type { CustomProvider } from '@/lib/api/contracts/custom-providers'
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

  setCustomProviderModels: (models: CustomProviderModel[]) => {
    const customProviderModels = Object.fromEntries(models.map((model) => [model.id, model]))
    const customModelsByProvider = {
      'custom-openai': models
        .filter((model) => model.providerId === 'custom-openai')
        .map((model) => model.id),
      'custom-anthropic': models
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
    return get().customProviderModels[modelId]
  },

  getOpenRouterModelInfo: (modelId: string) => {
    return get().openRouterModelInfo[modelId]
  },
}))

export function createCustomProviderModels(providers: CustomProvider[]): CustomProviderModel[] {
  return providers.flatMap((provider) => {
    const providerId = provider.protocol === 'anthropic' ? 'custom-anthropic' : 'custom-openai'
    return provider.models.map((model) => ({
      id: model.startsWith(`${providerId}/`) ? model : `${providerId}/${model}`,
      label: `${provider.name} / ${model}`,
      providerId,
      customProviderId: provider.id,
      customProviderName: provider.name,
      endpoint: provider.baseUrl,
      hasApiKey: provider.hasApiKey,
    }))
  })
}
