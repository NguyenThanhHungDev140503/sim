/**
 * @vitest-environment node
 */
import type { CustomProvider } from '@/lib/api/contracts/custom-providers'
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

  it('creates execution-compatible model IDs with endpoint metadata', () => {
    expect(createCustomProviderModels([provider])).toEqual([
      {
        id: 'custom-openai/local-model',
        label: 'Local Gateway / local-model',
        providerId: 'custom-openai',
        customProviderId: 'provider-1',
        customProviderName: 'Local Gateway',
        endpoint: 'https://gateway.example/v1',
        hasApiKey: true,
      },
    ])
  })

  it('syncs custom models into provider state and lookup metadata', () => {
    const model = createCustomProviderModels([provider])[0]
    useProvidersStore.getState().setCustomProviderModels([model])

    expect(useProvidersStore.getState().providers['custom-openai'].models).toEqual([
      'custom-openai/local-model',
    ])
    expect(useProvidersStore.getState().customProviderModels[model.id]).toEqual(model)
  })
})
