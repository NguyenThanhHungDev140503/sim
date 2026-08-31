import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { isRecordLike } from '@sim/utils/object'
import OpenAI from 'openai'
import type {
  ChatCompletion,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions'
import type { NormalizedBlockOutput, StreamingExecution } from '@/executor/types'
import { MAX_TOOL_ITERATIONS } from '@/providers'
import { formatMessagesForProvider } from '@/providers/attachments'
import { createOpenAICompatAssistantHistory } from '@/providers/openai-compat/assistant-history'
import { getCachedProviderClient } from '@/providers/client-cache'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'
import { getOpenAICompatibleApiBaseUrl } from '@/providers/openai-compat/base-url'
import { createOpenAICompatStreamingToolLoopStream } from '@/providers/openai-compat/streaming-tool-loop'
import { createOpenAICompatibleAgentEventStream } from '@/providers/openai-compat/stream-events'
import { createStreamingExecution } from '@/providers/streaming-execution'
import { isAbortError, parseToolArguments } from '@/providers/streaming-tool-loop-shared'
import { adaptOpenAIChatToolSchema } from '@/providers/tool-schema-adapter'
import { enrichLastModelSegmentFromChatCompletions } from '@/providers/trace-enrichment'
import { openAICompatTransport } from '@/providers/transport'
import type { Message, ProviderConfig, ProviderRequest, ProviderResponse, TimeSegment } from '@/providers/types'
import { ProviderError } from '@/providers/types'
import {
  calculateCost,
  isFunctionToolCall,
  prepareToolExecution,
  prepareToolsWithUsageControl,
  sumToolCosts,
  trackForcedToolUsage,
} from '@/providers/utils'
import { createPinnedFetch, validateUrlWithDNS } from '@/lib/core/security/input-validation.server'

const logger = createLogger('CustomOpenAIProvider')

function envValue(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

export function resolveCustomOpenAIEndpoint(request: Pick<ProviderRequest, 'customEndpoint' | 'azureEndpoint'>): string | undefined {
  return request.customEndpoint || request.azureEndpoint || envValue('CUSTOM_OPENAI_BASE_URL')
}

export function resolveCustomAnthropicEndpoint(
  request: Pick<ProviderRequest, 'customEndpoint' | 'azureEndpoint'>
): string | undefined {
  return request.customEndpoint || request.azureEndpoint || envValue('CUSTOM_ANTHROPIC_BASE_URL')
}

export function resolveCustomOpenAIClientConfig(
  request: Pick<ProviderRequest, 'customEndpoint' | 'azureEndpoint' | 'apiKey'>
): { baseURL: string | undefined; apiKey: string } {
  const endpoint = resolveCustomOpenAIEndpoint(request)
  return {
    baseURL: endpoint ? getOpenAICompatibleApiBaseUrl(endpoint) : undefined,
    apiKey: request.apiKey || envValue('CUSTOM_OPENAI_API_KEY') || 'empty',
  }
}

export function normalizeCustomOpenAIFinishReason(
  response: Pick<ChatCompletion, 'choices'>
): ChatCompletion {
  const choice = response.choices[0]
  if (
    choice?.finish_reason === 'stop' &&
    choice.message?.tool_calls &&
    choice.message.tool_calls.length > 0
  ) {
    return {
      ...response,
      choices: response.choices.map((item, index) =>
        index === 0 ? { ...item, finish_reason: 'tool_calls' } : item
      ),
    } as ChatCompletion
  }
  return response as ChatCompletion
}

function normalizeCustomOpenAIStream(
  stream: AsyncIterable<ChatCompletionChunk>
): AsyncIterable<ChatCompletionChunk> {
  return (async function* () {
    let sawToolCall = false
    for await (const chunk of stream) {
      if (chunk.choices.some((choice) => (choice.delta.tool_calls?.length ?? 0) > 0)) {
        sawToolCall = true
      }
      if (
        sawToolCall &&
        chunk.choices.some((choice) => choice.finish_reason === 'stop')
      ) {
        yield {
          ...chunk,
          choices: chunk.choices.map((choice) =>
            choice.finish_reason === 'stop'
              ? { ...choice, finish_reason: 'tool_calls' }
              : choice
          ),
        }
      } else {
        yield chunk
      }
    }
  })()
}

async function createOpenAIClient(request: ProviderRequest): Promise<OpenAI> {
  const endpoint = resolveCustomOpenAIEndpoint(request)
  if (!endpoint) throw new Error('Custom OpenAI endpoint is required')

  let pinnedFetch: typeof fetch | undefined
  let pinnedIP: string | undefined
  const validation = await validateUrlWithDNS(endpoint, 'custom OpenAI endpoint', {
    allowHttp: true,
  })
  if (!validation.isValid) throw new Error(`Invalid custom OpenAI endpoint: ${validation.error}`)
  if (!validation.resolvedIP) throw new Error('Custom OpenAI endpoint could not be pinned')
  pinnedIP = validation.resolvedIP
  pinnedFetch = createPinnedFetch(pinnedIP)

  const { baseURL, apiKey } = resolveCustomOpenAIClientConfig(request)
  if (!baseURL) throw new Error('Custom OpenAI endpoint is required')
  return getCachedProviderClient(
    `custom-openai::${apiKey}::${baseURL}::${pinnedIP ?? 'no-pin'}`,
    () => new OpenAI({ ...openAICompatTransport(), apiKey, baseURL, ...(pinnedFetch ? { fetch: pinnedFetch } : {}) })
  )
}

function buildMessages(request: ProviderRequest): Message[] {
  const messages: Message[] = []
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt })
  if (request.context) messages.push({ role: 'user', content: request.context })
  messages.push(...(request.messages ?? []))
  return formatMessagesForProvider(messages, 'custom-openai') as Message[]
}

function buildPayload(request: ProviderRequest, messages: Message[]) {
  const payload: Record<string, unknown> = {
    model: request.model.replace(/^custom-openai\//, ''),
    messages,
  }
  if (request.temperature !== undefined) payload.temperature = request.temperature
  if (request.maxTokens != null) payload.max_tokens = request.maxTokens
  if (request.reasoningEffort && !['auto', 'none'].includes(request.reasoningEffort)) {
    payload.reasoning_effort = request.reasoningEffort
  }
  if (request.responseFormat) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: request.responseFormat.name || 'response_schema',
        schema: request.responseFormat.schema || request.responseFormat,
        strict: request.responseFormat.strict !== false,
      },
    }
  }
  return payload
}

type Completion = OpenAI.Chat.Completions.ChatCompletion

function asCompletionPayload(
  payload: Record<string, unknown>
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  return payload as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
}

function toolResultShape(value: unknown): {
  success: boolean
  output?: unknown
  error?: string
  cost?: unknown
} {
  if (!isRecordLike(value)) return { success: false, error: 'Tool returned invalid result' }
  return {
    success: value.success === true,
    output: value.output,
    error: typeof value.error === 'string' ? value.error : undefined,
    cost: value.cost,
  }
}

async function executeNonStreamingRequest(
  request: ProviderRequest,
  client: OpenAI,
  payload: Record<string, unknown>,
  messages: Message[],
  preparedTools: ReturnType<typeof prepareToolsWithUsageControl> | null
): Promise<ProviderResponse> {
  const startedAt = Date.now()
  const startedISO = new Date(startedAt).toISOString()
  const currentMessages = [...messages]
  const toolCalls: NonNullable<ProviderResponse['toolCalls']> = []
  const toolResults: Record<string, unknown>[] = []
  const tokens = { input: 0, output: 0, total: 0 }
  const timeSegments: TimeSegment[] = []
  let response: Completion
  let content = ''
  let iterations = 0
  let usedForcedTools: string[] = []
  let nextToolChoice = payload.tool_choice

  try {
      response = normalizeCustomOpenAIFinishReason(
        await client.chat.completions.create(
        asCompletionPayload({
          ...payload,
          ...(preparedTools?.tools ? { tools: preparedTools.tools } : {}),
        }),
        request.abortSignal ? { signal: request.abortSignal } : undefined
        )
      )

    while (iterations <= MAX_TOOL_ITERATIONS) {
      const modelStart = Date.now()
      const message = response.choices[0]?.message
      const calls = message?.tool_calls?.filter(isFunctionToolCall)
      content = message?.content || content
      tokens.input += response.usage?.prompt_tokens || 0
      tokens.output += response.usage?.completion_tokens || 0
      tokens.total += response.usage?.total_tokens || 0
      timeSegments.push({
        type: 'model',
        name: request.model,
        startTime: modelStart,
        endTime: Date.now(),
        duration: Date.now() - modelStart,
      })
      enrichLastModelSegmentFromChatCompletions(timeSegments, response, calls, {
        model: request.model,
        provider: 'custom-openai',
      })

      // Some gateways attach tool_calls but incorrectly report "stop".
      if (!calls?.length) {
        break
      }
      if (iterations === MAX_TOOL_ITERATIONS) break

      if (typeof nextToolChoice === 'object' && nextToolChoice !== null) {
        const tracked = trackForcedToolUsage(
          calls,
          nextToolChoice,
          logger,
          'custom-openai',
          preparedTools?.forcedTools,
          usedForcedTools
        )
        usedForcedTools = tracked.usedForcedTools
      }

      if (message) {
        currentMessages.push(
          createOpenAICompatAssistantHistory({
            message,
            toolCalls: calls,
            reasoningFields: ['reasoning', 'reasoning_content'],
          }) as Message
        )
      }

      const results = await Promise.all(
        calls.map(async (call) => {
          const toolStartedAt = Date.now()
          try {
            const tool = request.tools?.find((item) => item.id === call.function.name)
            if (!tool) throw new Error(`Tool "${call.function.name}" is not available`)
            const args = parseToolArguments(call.function.arguments, call.function.name)
            const { toolParams, executionParams } = prepareToolExecution(
              tool,
              args,
              request,
              call.id
            )
            const executed = await executeProviderTool(
              call.function.name,
              executionParams,
              { signal: request.abortSignal }
            )
            return {
              call,
              toolParams,
              rawResponse: toolResultShape(executed.rawResponse),
              modelResponse: toolResultShape(executed.modelResponse ?? executed.rawResponse),
              toolStartedAt,
            }
          } catch (error) {
            if (isAbortError(error) || request.abortSignal?.aborted) throw error
            const failure = { success: false, error: getErrorMessage(error, 'Tool execution failed') }
            return {
              call,
              toolParams: {},
              rawResponse: failure,
              modelResponse: failure,
              toolStartedAt,
            }
          }
        })
      )

      for (const result of results) {
        const endedAt = Date.now()
        const modelOutput = result.modelResponse
        if (result.rawResponse.success && isRecordLike(result.rawResponse.output)) {
          toolResults.push(result.rawResponse.output)
        }
        toolCalls.push({
          name: result.call.function.name,
          arguments: result.toolParams,
          startTime: new Date(result.toolStartedAt).toISOString(),
          endTime: new Date(endedAt).toISOString(),
          duration: endedAt - result.toolStartedAt,
          result: result.rawResponse.success
            ? (result.rawResponse.output ?? null)
            : result.rawResponse,
          success: result.rawResponse.success,
        })
        timeSegments.push({
          type: 'tool',
          name: result.call.function.name,
          startTime: result.toolStartedAt,
          endTime: endedAt,
          duration: endedAt - result.toolStartedAt,
          toolCallId: result.call.id,
        })
        currentMessages.push({
          role: 'tool',
          tool_call_id: result.call.id,
          content: JSON.stringify(modelOutput.success ? (modelOutput.output ?? null) : modelOutput),
        })
      }

      const remaining = preparedTools?.forcedTools.find((name) => !usedForcedTools.includes(name))
      nextToolChoice = remaining
        ? { type: 'function', function: { name: remaining } }
        : 'auto'
      response = normalizeCustomOpenAIFinishReason(
        await client.chat.completions.create(
          asCompletionPayload({
            ...payload,
            messages: currentMessages,
            ...(preparedTools?.tools ? { tools: preparedTools.tools } : {}),
            tool_choice: nextToolChoice,
          }),
          request.abortSignal ? { signal: request.abortSignal } : undefined
        )
      )
      iterations++
    }
  } catch (error) {
    throw new ProviderError(
      `Custom OpenAI request failed: ${getErrorMessage(error, 'Unknown error')}`,
      {
        startTime: startedISO,
        endTime: new Date().toISOString(),
        duration: Date.now() - startedAt,
      },
      { cause: error instanceof Error ? error : undefined }
    )
  }

  const cost = calculateCost(request.model, tokens.input, tokens.output)
  const toolCost = sumToolCosts(toolResults)
  return {
    content,
    model: request.model,
    tokens,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    toolResults: toolResults.length ? toolResults : undefined,
    timing: {
      startTime: startedISO,
      endTime: new Date().toISOString(),
      duration: Date.now() - startedAt,
      iterations: iterations + 1,
      timeSegments,
    },
    cost: {
      input: cost.input,
      output: cost.output,
      total: cost.total + toolCost,
      ...(toolCost ? { toolCost } : {}),
      pricing: cost.pricing,
    },
  }
}

export const customOpenAIProvider: ProviderConfig = {
  id: 'custom-openai',
  name: 'Custom OpenAI',
  description: 'Custom endpoint with OpenAI-compatible API',
  version: '1.0.0',
  models: getProviderModels('custom-openai'),
  defaultModel: getProviderDefaultModel('custom-openai'),
  executeRequest: async (request): Promise<ProviderResponse | StreamingExecution> => {
    const client = await createOpenAIClient(request)
    const messages = buildMessages(request)
    const payload = buildPayload(request, messages)
    const tools = request.tools?.length
      ? request.tools.map(adaptOpenAIChatToolSchema)
      : undefined
    const preparedTools = tools?.length
      ? prepareToolsWithUsageControl(tools, request.tools, logger, 'custom-openai')
      : null
    if (preparedTools?.tools?.length) {
      payload.tools = preparedTools.tools
      payload.tool_choice = preparedTools.toolChoice
    }

    const providerStartTime = Date.now()
    const providerStartTimeISO = new Date(providerStartTime).toISOString()
    const timeSegments: TimeSegment[] = []
    if (!request.stream) {
      return executeNonStreamingRequest(request, client, payload, messages, preparedTools)
    }
    const streamResponse = payload.tools
      ? undefined
      : await client.chat.completions.create(
          {
            ...payload,
            stream: true,
            stream_options: { include_usage: true },
          } as ChatCompletionCreateParamsStreaming,
          request.abortSignal ? { signal: request.abortSignal } : undefined
        )
    return createStreamingExecution({
      model: request.model,
      providerStartTime,
      providerStartTimeISO,
      timing: payload.tools
        ? {
            kind: 'accumulated',
            modelTime: 0,
            toolsTime: 0,
            firstResponseTime: 0,
            iterations: 1,
            timeSegments,
          }
        : { kind: 'simple', segmentName: request.model },
      initialTokens: { input: 0, output: 0, total: 0 },
      initialCost: { input: 0, output: 0, total: 0 },
      isStreaming: true,
      streamFormat: 'agent-events-v1',
      createStream: ({ output, finalizeTiming }) => {
        if (payload.tools) {
          return createOpenAICompatStreamingToolLoopStream({
            providerName: 'CustomOpenAI',
            request,
            basePayload: payload,
            // double-cast-allowed: formatted messages are OpenAI-compatible wire messages.
            messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            createStream: async (params, options) =>
              normalizeCustomOpenAIStream(
                await client.chat.completions.create(
                  { ...params, stream: true, stream_options: { include_usage: true } },
                  options
                )
              ),
            logger,
            timeSegments,
            forcedTools: preparedTools?.forcedTools,
            onComplete: (result) => {
              output.content = result.content
              output.tokens = result.tokens
              output.cost = result.cost
              output.toolCalls = result.toolCalls as NormalizedBlockOutput['toolCalls']
              finalizeTiming()
            },
          })
        }
        return createOpenAICompatibleAgentEventStream(
          normalizeCustomOpenAIStream(streamResponse!),
          {
            providerName: 'CustomOpenAI',
            onComplete: (result) => {
              output.content = result.content
              output.tokens = {
                input: result.usage.prompt_tokens,
                output: result.usage.completion_tokens,
                total: result.usage.total_tokens,
              }
              const cost = calculateCost(request.model, result.usage.prompt_tokens, result.usage.completion_tokens)
              output.cost = { input: cost.input, output: cost.output, total: cost.total }
              const segment = output.providerTiming?.timeSegments?.[0]
              if (segment && result.thinking) segment.thinkingContent = result.thinking
              finalizeTiming()
            },
          }
        )
      },
    })
  },
}

export const customAnthropicProvider: ProviderConfig = {
  id: 'custom-anthropic',
  name: 'Custom Anthropic',
  description: 'Custom endpoint with Anthropic-compatible API',
  version: '1.0.0',
  models: getProviderModels('custom-anthropic'),
  defaultModel: getProviderDefaultModel('custom-anthropic'),
  executeRequest: async (request) => {
    const endpoint = resolveCustomAnthropicEndpoint(request)
    const apiKey = request.apiKey || envValue('CUSTOM_ANTHROPIC_API_KEY')
    if (!endpoint) throw new Error('Custom Anthropic endpoint is required')
    if (!apiKey) throw new Error('API key is required for Custom Anthropic')
    const validation = await validateUrlWithDNS(endpoint, 'custom Anthropic endpoint', {
      allowHttp: true,
    })
    if (!validation.isValid) {
      throw new Error(`Invalid custom Anthropic endpoint: ${validation.error}`)
    }
    if (!validation.resolvedIP) {
      throw new Error('Custom Anthropic endpoint could not be pinned')
    }
    const pinnedIP = validation.resolvedIP
    const pinnedFetch = createPinnedFetch(pinnedIP)
    const [{ default: Anthropic }, { executeAnthropicProviderRequest }] = await Promise.all([
      import('@anthropic-ai/sdk'),
      import('@/providers/anthropic/core'),
    ])
    return executeAnthropicProviderRequest(request, {
      providerId: 'custom-anthropic',
      providerLabel: 'Custom Anthropic',
      resolveWireModel: ({ model }) => model.replace(/^custom-anthropic\//, ''),
      createClient: (key) =>
        getCachedProviderClient(`custom-anthropic::${key}::${endpoint}::${pinnedIP}`, () =>
          new Anthropic({ apiKey: key, baseURL: endpoint, fetch: pinnedFetch })
        ),
      logger,
    })
  },
}
