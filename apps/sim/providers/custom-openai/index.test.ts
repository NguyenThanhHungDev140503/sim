/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreate,
  mockValidateUrlWithDNS,
  mockCreatePinnedFetch,
  mockExecuteProviderTool,
  mockCreateStreamingToolLoop,
  mockExecuteAnthropicProviderRequest,
  openAIArgs,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockValidateUrlWithDNS: vi.fn(),
  mockCreatePinnedFetch: vi.fn(() => vi.fn()),
  mockExecuteProviderTool: vi.fn(),
  mockCreateStreamingToolLoop: vi.fn(),
  mockExecuteAnthropicProviderRequest: vi.fn(),
  openAIArgs: [] as Record<string, unknown>[],
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } }

    constructor(options: Record<string, unknown>) {
      openAIArgs.push(options)
    }
  },
}))
vi.mock('@/lib/core/security/input-validation.server', () => ({
  validateUrlWithDNS: mockValidateUrlWithDNS,
  createPinnedFetch: mockCreatePinnedFetch,
}))
vi.mock('@/lib/core/config/env-flags', () => ({
  isPrivateCustomEndpointsAllowed: false,
}))
vi.mock('@/providers/client-cache', () => ({
  getCachedProviderClient: vi.fn((_key, create) => create()),
}))
vi.mock('@/providers/attachments', () => ({
  formatMessagesForProvider: vi.fn((messages) => messages),
}))
vi.mock('@/providers/models', () => ({
  getProviderModels: vi.fn(() => []),
  getProviderDefaultModel: vi.fn((id: string) => `${id}/generic`),
}))
vi.mock('@/providers/runtime-context', () => ({
  executeProviderTool: mockExecuteProviderTool,
}))
vi.mock('@/providers/streaming-execution', () => ({
  createStreamingExecution: vi.fn((options) => options),
}))
vi.mock('@/providers/trace-enrichment', () => ({
  enrichLastModelSegmentFromChatCompletions: vi.fn((segments, response) => {
    const segment = segments.at(-1)
    const reasoning = response.choices[0]?.message?.reasoning_content
    if (segment && reasoning) segment.thinkingContent = reasoning
  }),
}))
vi.mock('@/providers', () => ({ MAX_TOOL_ITERATIONS: 3 }))
vi.mock('@/providers/utils', () => ({
  calculateCost: vi.fn(() => ({
    input: 0,
    output: 0,
    total: 0,
    pricing: { input: 0, output: 0, updatedAt: '2026-01-01' },
  })),
  isFunctionToolCall: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'function' in value &&
    Boolean((value as { function?: unknown }).function),
  prepareToolExecution: vi.fn((_tool, args) => ({
    toolParams: args,
    executionParams: args,
  })),
  prepareToolsWithUsageControl: vi.fn((tools) => ({
    tools,
    toolChoice: 'auto',
    forcedTools: [],
  })),
  sumToolCosts: vi.fn(() => 0),
  trackForcedToolUsage: vi.fn(() => ({ usedForcedTools: [] })),
}))
vi.mock('@/providers/openai-compat/streaming-tool-loop', () => ({
  createOpenAICompatStreamingToolLoopStream: mockCreateStreamingToolLoop,
}))
vi.mock('@/providers/openai-compat/stream-events', () => ({
  createOpenAICompatibleAgentEventStream: vi.fn(),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor(public options: Record<string, unknown>) {}
  },
}))
vi.mock('@/providers/anthropic/core', () => ({
  executeAnthropicProviderRequest: mockExecuteAnthropicProviderRequest,
}))

import {
  customAnthropicProvider,
  customOpenAIProvider,
  normalizeCustomOpenAIFinishReason,
  resolveCustomAnthropicEndpoint,
  resolveCustomOpenAIClientConfig,
  resolveCustomOpenAIEndpoint,
} from './index'

const tool = {
  id: 'lookup',
  name: 'lookup',
  description: 'lookup',
  params: {},
  parameters: { type: 'object', properties: {}, required: [] },
}

describe('custom providers', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockValidateUrlWithDNS.mockReset()
    mockValidateUrlWithDNS.mockResolvedValue({ isValid: true, resolvedIP: '203.0.113.8' })
    mockExecuteProviderTool.mockReset()
    mockCreateStreamingToolLoop.mockReset()
    mockExecuteAnthropicProviderRequest.mockReset()
    openAIArgs.length = 0
    delete process.env.CUSTOM_OPENAI_BASE_URL
    delete process.env.CUSTOM_ANTHROPIC_BASE_URL
    delete process.env.CUSTOM_ANTHROPIC_API_KEY
  })

  it('registers both provider ids', () => {
    expect(customOpenAIProvider.id).toBe('custom-openai')
    expect(customAnthropicProvider.id).toBe('custom-anthropic')
  })

  it('resolves custom providers through registry', async () => {
    const { getProviderExecutor } = await import('@/providers/registry')
    await expect(getProviderExecutor('custom-openai')).resolves.toBe(customOpenAIProvider)
    await expect(getProviderExecutor('custom-anthropic')).resolves.toBe(customAnthropicProvider)
  })

  it('resolves endpoint precedence and client config', () => {
    process.env.CUSTOM_OPENAI_BASE_URL = 'https://env.example.com'
    expect(resolveCustomOpenAIEndpoint({ customEndpoint: 'https://custom.example.com' })).toBe(
      'https://custom.example.com'
    )
    expect(resolveCustomAnthropicEndpoint({ azureEndpoint: 'https://azure.example.com' })).toBe(
      'https://azure.example.com'
    )
    expect(
      resolveCustomOpenAIClientConfig({
        customEndpoint: 'https://custom.example.com/v1/',
        apiKey: 'request-key',
      })
    ).toEqual({ baseURL: 'https://custom.example.com/v1', apiKey: 'request-key' })
  })

  it('pins env endpoint and passes API key to OpenAI client', async () => {
    process.env.CUSTOM_OPENAI_BASE_URL = 'https://env.example.com'
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    })

    await customOpenAIProvider.executeRequest({
      model: 'custom-openai/model',
      apiKey: 'request-key',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(mockValidateUrlWithDNS).toHaveBeenCalledWith(
      'https://env.example.com',
      'custom OpenAI endpoint',
      { allowHttp: true }
    )
    expect(mockCreatePinnedFetch).toHaveBeenCalledWith('203.0.113.8')
    expect(openAIArgs[0]).toMatchObject({
      apiKey: 'request-key',
      baseURL: 'https://env.example.com/v1',
    })
  })

  it('rejects custom endpoint when DNS validation fails', async () => {
    mockValidateUrlWithDNS.mockResolvedValue({
      isValid: false,
      error: 'private address',
    })

    await expect(
      customOpenAIProvider.executeRequest({
        model: 'custom-openai/model',
        customEndpoint: 'http://127.0.0.1:8000',
        messages: [{ role: 'user', content: 'hi' }],
      })
    ).rejects.toThrow('Invalid custom OpenAI endpoint: private address')
    expect(mockValidateUrlWithDNS).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      'custom OpenAI endpoint',
      { allowHttp: true, allowLocalhost: false }
    )
  })

  it('rejects custom Anthropic endpoint before client creation when DNS validation fails', async () => {
    mockValidateUrlWithDNS.mockResolvedValue({
      isValid: false,
      error: 'private address',
    })

    await expect(
      customAnthropicProvider.executeRequest({
        model: 'custom-anthropic/model',
        customEndpoint: 'http://127.0.0.1:8000',
        apiKey: 'key',
        messages: [{ role: 'user', content: 'hi' }],
      })
    ).rejects.toThrow('Invalid custom Anthropic endpoint: private address')
    expect(mockValidateUrlWithDNS).toHaveBeenCalledWith(
      'http://127.0.0.1:8000',
      'custom Anthropic endpoint',
      { allowHttp: true, allowLocalhost: false }
    )
  })

  it('pins a valid custom Anthropic endpoint', async () => {
    mockExecuteAnthropicProviderRequest.mockResolvedValue({ content: 'ok' })

    await customAnthropicProvider.executeRequest({
      model: 'custom-anthropic/model',
      customEndpoint: 'https://anthropic.example.com',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(mockValidateUrlWithDNS).toHaveBeenCalledWith(
      'https://anthropic.example.com',
      'custom Anthropic endpoint',
      { allowHttp: true }
    )
    expect(mockCreatePinnedFetch).toHaveBeenCalledWith('203.0.113.8')
  })

  it('passes env-only Anthropic API key into shared execution core', async () => {
    process.env.CUSTOM_ANTHROPIC_BASE_URL = 'https://anthropic.example.com'
    process.env.CUSTOM_ANTHROPIC_API_KEY = 'env-key'
    mockExecuteAnthropicProviderRequest.mockResolvedValue({ content: 'ok' })

    const request = {
      model: 'custom-anthropic/model',
      messages: [{ role: 'user' as const, content: 'hi' }],
    }
    await customAnthropicProvider.executeRequest(request)

    expect(mockExecuteAnthropicProviderRequest).toHaveBeenCalledWith(
      { ...request, apiKey: 'env-key' },
      expect.any(Object)
    )
  })

  it('executes non-stream tool loop and preserves reasoning metadata', async () => {
    mockCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '',
              reasoning_content: 'thinking',
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'done' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
      })
    mockExecuteProviderTool.mockResolvedValue({
      rawResponse: { success: true, output: { value: 42 } },
      modelResponse: { success: true, output: { value: 42 } },
    })

    const result = await customOpenAIProvider.executeRequest({
      model: 'custom-openai/model',
      customEndpoint: 'https://custom.example.com',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [tool],
    })

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockValidateUrlWithDNS).toHaveBeenCalledWith(
      'https://custom.example.com',
      'custom OpenAI endpoint',
      { allowHttp: true }
    )
    expect(mockExecuteProviderTool).toHaveBeenCalledTimes(1)
    expect((result as { content: string }).content).toBe('done')
    expect((result as { tokens: { total: number } }).tokens.total).toBe(14)
    expect(
      (result as { timing: { timeSegments: Array<{ thinkingContent?: string }> } }).timing
        .timeSegments[0].thinkingContent
    ).toBe('thinking')
  })

  it('preserves reasoning for later streaming tool-loop turns', async () => {
    mockCreateStreamingToolLoop.mockReturnValue(new ReadableStream())

    const execution = (await customOpenAIProvider.executeRequest({
      model: 'custom-openai/model',
      customEndpoint: 'https://custom.example.com',
      apiKey: 'key',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [tool],
    })) as unknown as {
      createStream: (handles: {
        output: Record<string, unknown>
        finalizeTiming: () => void
      }) => ReadableStream<unknown>
    }

    execution.createStream({ output: {}, finalizeTiming: vi.fn() })

    expect(mockCreateStreamingToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({ preserveAssistantReasoning: true })
    )
  })

  it('normalizes stop finish reason only when tool calls exist', () => {
    const normalized = normalizeCustomOpenAIFinishReason({
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
          finish_reason: 'stop',
        },
      ],
    })
    expect(normalized.choices[0].finish_reason).toBe('tool_calls')
  })
})
