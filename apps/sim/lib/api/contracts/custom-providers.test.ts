import { describe, expect, it } from 'vitest'
import {
  customProviderSchema,
  discoverCustomModelsResponseSchema,
} from '@/lib/api/contracts/custom-providers'

describe('custom provider contracts', () => {
  it('accepts saved providers without exposing encrypted secrets', () => {
    const result = customProviderSchema.parse({
      id: 'provider-1',
      name: 'Local gateway',
      protocol: 'openai',
      baseUrl: 'https://example.com/v1',
      hasApiKey: true,
      maskedApiKey: 'sk-a...1234',
      models: ['model-a'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    expect(result).not.toHaveProperty('encryptedApiKey')
    expect(result.models).toEqual(['model-a'])
  })

  it('accepts discovery responses with sanitized model metadata', () => {
    expect(
      discoverCustomModelsResponseSchema.parse({
        success: true,
        models: [{ id: 'model-a', name: 'Model A' }],
      }).models
    ).toHaveLength(1)
  })
})
