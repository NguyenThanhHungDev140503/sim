import { createLogger } from '@sim/logger'
import OpenAI from 'openai'
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions'
import type { NormalizedBlockOutput, StreamingExecution } from '@/executor/types'
import { formatMessagesForProvider } from '@/providers/attachments'
import { getCachedProviderClient } from '@/providers/client-cache'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'
import { getOpenAICompatibleApiBaseUrl } from '@/providers/openai-compat/base-url'
import { createOpenAICompatStreamingToolLoopStream } from '@/providers/openai-compat/streaming-tool-loop'
import { createOpenAICompatibleAgentEventStream } from '@/providers/openai-compat/stream-events'
import { createStreamingExecution } from '@/providers/streaming-execution'
import { adaptOpenAIChatToolSchema } from '@/providers/tool-schema-adapter'
import { openAICompatTransport } from '@/providers/transport'
import type { Message, ProviderConfig, ProviderRequest, ProviderResponse, TimeSegment } from '@/providers/types'
import { calculateCost, prepareToolsWithUsageControl } from '@/providers/utils'
import { createPinnedFetch, validateUrlWithDNS } from '@/lib/core/security/input-validation.server'

const logger = createLogger('CustomOpenAIProvider')

function envValue(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

export function resolveCustomOpenAIEndpoint(request: Pick<ProviderRequest, 'customEndpoint' | 'azureEndpoint'>): string | undefined {
  return request.customEndpoint || request.azureEndpoint || envValue('CUSTOM_OPENAI_BASE_URL')
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

async function createOpenAIClient(request: ProviderRequest): Promise<OpenAI> {
  const userEndpoint = request.customEndpoint || request.azureEndpoint
  const endpoint = resolveCustomOpenAIEndpoint(request)
  if (!endpoint) throw new Error('Custom OpenAI endpoint is required')

  let pinnedFetch: typeof fetch | undefined
  let pinnedIP: string | undefined
  if (userEndpoint) {
    const validation = await validateUrlWithDNS(userEndpoint, 'custom OpenAI endpoint', {
      allowHttp: true,
    })
    if (!validation.isValid) throw new Error(`Invalid custom OpenAI endpoint: ${validation.error}`)
    if (!validation.resolvedIP) throw new Error('Custom OpenAI endpoint could not be pinned')
    pinnedIP = validation.resolvedIP
    pinnedFetch = createPinnedFetch(pinnedIP)
  }

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
      const response = await client.chat.completions.create(
        { ...payload, ...(preparedTools?.tools ? { tools: preparedTools.tools } : {}) },
        request.abortSignal ? { signal: request.abortSignal } : undefined
      )
      const usage = response.usage
      const cost = calculateCost(request.model, usage?.prompt_tokens || 0, usage?.completion_tokens || 0)
      return {
        content: response.choices[0]?.message?.content || '',
        model: request.model,
        tokens: {
          input: usage?.prompt_tokens || 0,
          output: usage?.completion_tokens || 0,
          total: usage?.total_tokens || 0,
        },
        cost: { input: cost.input, output: cost.output, total: cost.total, pricing: cost.pricing },
        timing: {
          startTime: providerStartTimeISO,
          endTime: new Date().toISOString(),
          duration: Date.now() - providerStartTime,
          timeSegments,
        },
      }
    }
    return createStreamingExecution({
      model: request.model,
      providerStartTime,
      providerStartTimeISO,
      timing: { kind: 'accumulated', modelTime: 0, toolsTime: 0, firstResponseTime: 0, iterations: 1, timeSegments },
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
              client.chat.completions.create(
                { ...params, stream: true, stream_options: { include_usage: true } },
                options
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
          client.chat.completions.create(
            { ...payload, stream: true, stream_options: { include_usage: true } } as ChatCompletionCreateParamsStreaming,
            request.abortSignal ? { signal: request.abortSignal } : undefined
          ),
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
    const endpoint = request.customEndpoint || request.azureEndpoint || envValue('CUSTOM_ANTHROPIC_BASE_URL')
    const apiKey = request.apiKey || envValue('CUSTOM_ANTHROPIC_API_KEY')
    if (!endpoint) throw new Error('Custom Anthropic endpoint is required')
    if (!apiKey) throw new Error('API key is required for Custom Anthropic')
    const [{ default: Anthropic }, { executeAnthropicProviderRequest }] = await Promise.all([
      import('@anthropic-ai/sdk'),
      import('@/providers/anthropic/core'),
    ])
    return executeAnthropicProviderRequest(request, {
      providerId: 'custom-anthropic',
      providerLabel: 'Custom Anthropic',
      resolveWireModel: ({ model }) => model.replace(/^custom-anthropic\//, ''),
      createClient: (key) =>
        getCachedProviderClient(`custom-anthropic::${key}::${endpoint}`, () =>
          new Anthropic({ apiKey: key, baseURL: endpoint })
        ),
      logger,
    })
  },
}
