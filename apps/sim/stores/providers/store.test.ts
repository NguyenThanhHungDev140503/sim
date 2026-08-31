/**
 * @vitest-environment node
 */
import type { CustomProvider } from '@/lib/api/contracts/custom-providers'
import { buildCustomModelId } from '@/providers/custom-model'
import { createCustomProviderModels, useProvidersStore } from '@/stores/providers/store'
import { beforeEach, describe, expect, it } from 'vitest'

const provider: CustomProvider = {
  id: 'provider-1',
  name: 'Local Gateway',
  protocol: 'openai',
  baseUrl: 'https://gateway.example/v1',
  hasApiKey: true,
  maskedApiKey: 'test...key',
  models: ['local-model'],
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
}

describe('providers store custom models', () => {
  beforeEach(() => {
    useProvidersStore.setState({
      customProviderModels: {},
      providers: {
        ...useProvidersStore.getState().providers,
        'custom-openai': { models: [], isLoading: false },
        'custom-anthropic': { models: [], isLoading: false },
      },
    })
  })

  it('creates collision-free execution-compatible model IDs with endpoint metadata', () => {
    expect(createCustomProviderModels([provider])).toEqual([
      {
        id: buildCustomModelId('custom-openai', 'provider-1', 'local-model'),
        label: 'Local Gateway / local-model',
        providerId: 'custom-openai',
        customProviderId: 'provider-1',
        customProviderName: 'Local Gateway',
        endpoint: 'https://gateway.example/v1',
        hasApiKey: true,
      },
    ])
  })

  it('keeps duplicate model ids distinct across saved providers', () => {
    const providers: CustomProvider[] = [
      provider,
      { ...provider, id: 'provider-2', name: 'Second Gateway' },
    ]

    const models = createCustomProviderModels(providers)

    expect(models.map(({ id }) => id)).toEqual([
      'custom-openai/provider-1/local-model',
      'custom-openai/provider-2/local-model',
    ])
  })

  it('syncs custom models into provider state and lookup metadata', () => {
    const model = createCustomProviderModels([provider])[0]
    useProvidersStore.getState().setCustomProviderModels([model])

    expect(useProvidersStore.getState().providers['custom-openai'].models).toEqual([
      'custom-openai/provider-1/local-model',
    ])
    expect(useProvidersStore.getState().customProviderModels[model.id]).toEqual(model)
  })
})
