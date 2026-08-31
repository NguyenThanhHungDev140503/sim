import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { discoverCustomModelsContract } from '@/lib/api/contracts/custom-providers'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { isPrivateCustomEndpointsAllowed } from '@/lib/core/config/env-flags'
import { enforceUserRateLimit } from '@/lib/core/rate-limiter/route-helpers'
import { createPinnedFetch, validateUrlWithDNS } from '@/lib/core/security/input-validation.server'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getOpenAICompatibleApiBaseUrl } from '@/providers/openai-compat/base-url'

const logger = createLogger('DiscoverCustomModelsAPI')
const DISCOVERY_TIMEOUT_MS = 10_000

interface UpstreamModel {
  id?: unknown
  object?: unknown
  display_name?: unknown
  description?: unknown
}

function sanitizeModels(
  data: unknown
): Array<{ id: string; name: string; description?: string; object?: string }> {
  const rawModels = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && 'data' in data
      ? (data as { data?: unknown }).data
      : undefined

  if (!Array.isArray(rawModels)) return []

  return rawModels.flatMap((model: unknown) => {
    const id = typeof model === 'string' ? model : (model as UpstreamModel | null)?.id
    if (typeof id !== 'string' || id.trim().length === 0) return []

    const normalizedId = id.trim()
    const item = typeof model === 'object' && model !== null ? (model as UpstreamModel) : undefined
    const name =
      typeof item?.display_name === 'string' && item.display_name.trim()
        ? item.display_name.trim()
        : normalizedId
    const description =
      typeof item?.description === 'string' && item.description.trim()
        ? item.description.trim()
        : undefined
    const object = typeof item?.object === 'string' ? item.object : undefined

    return [
      {
        id: normalizedId,
        name,
        ...(description ? { description } : {}),
        ...(object !== undefined ? { object } : {}),
      },
    ]
  })
}

function failureResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error, models: [] }, { status })
}

export const POST = withRouteHandler(async (request: NextRequest, context: unknown) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimited = await enforceUserRateLimit('custom-model-discovery', session.user.id)
  if (rateLimited) return rateLimited

  const parsed = await parseRequest(discoverCustomModelsContract, request, context)
  if (!parsed.success) return parsed.response

  const { baseUrl, apiKey, protocol } = parsed.data.body
  const normalizedBaseUrl = baseUrl.trim()

  try {
    const validation = await validateUrlWithDNS(normalizedBaseUrl, 'Custom LLM endpoint', {
      allowHttp: true,
      allowLocalhost: isPrivateCustomEndpointsAllowed,
      ...(isPrivateCustomEndpointsAllowed ? { allowPrivate: true } : {}),
    })
    if (!validation.isValid) {
      return failureResponse(validation.error ?? 'Invalid custom LLM endpoint', 400)
    }

    const fetchImpl = validation.resolvedIP ? createPinnedFetch(validation.resolvedIP) : fetch
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    let modelsUrl: string

    if (protocol === 'anthropic') {
      const anthropicBaseUrl = normalizedBaseUrl.replace(/\/+$/, '')
      modelsUrl = anthropicBaseUrl.endsWith('/v1')
        ? `${anthropicBaseUrl}/models`
        : `${anthropicBaseUrl}/v1/models`
      headers['anthropic-version'] = '2023-06-01'
      if (apiKey) headers['x-api-key'] = apiKey
    } else {
      modelsUrl = `${getOpenAICompatibleApiBaseUrl(normalizedBaseUrl)}/models`
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    }

    const response = await fetchImpl(modelsUrl, {
      headers,
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    })

    if (!response.ok) {
      logger.warn('Custom model discovery upstream request failed', {
        protocol,
        status: response.status,
      })
      return failureResponse(`Upstream error (${response.status})`, response.status)
    }

    const models = sanitizeModels(await response.json())
    return NextResponse.json({ success: true, models })
  } catch (error) {
    const message = getErrorMessage(error, 'Failed to fetch models')
    logger.error('Custom model discovery failed', { protocol, error: message })
    return failureResponse(message, 500)
  }
})
