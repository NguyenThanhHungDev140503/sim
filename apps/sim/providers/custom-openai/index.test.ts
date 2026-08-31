import { describe, expect, it } from 'vitest'
import {
  customOpenAIProvider,
  resolveCustomOpenAIClientConfig,
  resolveCustomOpenAIEndpoint,
} from './index'

describe('customOpenAIProvider', () => {
  it('has correct id and handles custom requests', () => {
    expect(customOpenAIProvider.id).toBe('custom-openai')
  })

  it('prioritizes request endpoint over Azure endpoint and environment fallback', () => {
    process.env.CUSTOM_OPENAI_BASE_URL = 'https://env.example.com'
    expect(
      resolveCustomOpenAIEndpoint({
        customEndpoint: 'https://custom.example.com',
        azureEndpoint: 'https://azure.example.com',
      })
    ).toBe('https://custom.example.com')
    expect(resolveCustomOpenAIEndpoint({ azureEndpoint: 'https://azure.example.com' })).toBe(
      'https://azure.example.com'
    )
    expect(resolveCustomOpenAIEndpoint({})).toBe('https://env.example.com')
    delete process.env.CUSTOM_OPENAI_BASE_URL
  })

  it('builds OpenAI client config with request API key and normalized base URL', () => {
    expect(
      resolveCustomOpenAIClientConfig({
        customEndpoint: 'https://custom.example.com/v1/',
        apiKey: 'request-key',
      })
    ).toEqual({
      baseURL: 'https://custom.example.com/v1',
      apiKey: 'request-key',
    })
  })
})
