/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  discoverCustomModelsBodySchema,
  discoverCustomModelsResponseSchema,
} from '@/lib/api/contracts/custom-providers'

const { mockValidateUrlWithDNS, mockCreatePinnedFetch, mockPinnedFetch } = vi.hoisted(() => ({
  mockValidateUrlWithDNS: vi.fn(),
  mockCreatePinnedFetch: vi.fn(),
  mockPinnedFetch: vi.fn(),
}))

vi.mock('@/lib/core/security/input-validation.server', () => ({
  createPinnedFetch: mockCreatePinnedFetch,
  validateUrlWithDNS: mockValidateUrlWithDNS,
}))

import { POST } from './route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/providers/custom/discover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('custom model discovery contracts', () => {
  it('defaults protocol to openai for a valid base URL', () => {
    expect(
      discoverCustomModelsBodySchema.parse({ baseUrl: 'https://api.example.com' })
    ).toEqual({
      baseUrl: 'https://api.example.com',
      protocol: 'openai',
    })
  })

  it('rejects invalid base URLs and protocols', () => {
    expect(
      discoverCustomModelsBodySchema.safeParse({ baseUrl: 'not-a-url' }).success
    ).toBe(false)
    expect(
      discoverCustomModelsBodySchema.safeParse({
        baseUrl: 'https://api.example.com',
        protocol: 'gemini',
      }).success
    ).toBe(false)
  })

  it('rejects malformed response shapes', () => {
    expect(
      discoverCustomModelsResponseSchema.safeParse({
        success: true,
        models: [{ id: 'model-a' }],
      }).success
    ).toBe(false)
    expect(
      discoverCustomModelsResponseSchema.safeParse({
        success: true,
        models: [{ id: 'model-a', name: 'Model A', object: 123 }],
      }).success
    ).toBe(false)
  })
})

describe('POST /api/providers/custom/discover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateUrlWithDNS.mockResolvedValue({ isValid: true, resolvedIP: '203.0.113.10' })
    mockCreatePinnedFetch.mockReturnValue(mockPinnedFetch)
    mockPinnedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'model-a', owned_by: 'provider' },
            { id: 'model-b', display_name: 'Model B', object: 'model' },
            { id: 'model-d', object: 123 },
            { id: '' },
            'model-c',
            { name: 'ignored-without-id' },
          ],
        }),
        { status: 200 }
      )
    )
  })

  it('discovers and sanitizes models from pinned OpenAI-compatible endpoint', async () => {
    const response = await POST(
      request({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
        protocol: 'openai',
      }),
      {}
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      models: [
        { id: 'model-a', name: 'model-a' },
        { id: 'model-b', name: 'Model B', object: 'model' },
        { id: 'model-d', name: 'model-d' },
        { id: 'model-c', name: 'model-c' },
      ],
    })
    expect(mockValidateUrlWithDNS).toHaveBeenCalledWith('https://api.example.com/v1', 'Custom LLM endpoint', {
      allowHttp: true,
      allowLocalhost: false,
    })
    expect(mockCreatePinnedFetch).toHaveBeenCalledWith('203.0.113.10')
    expect(mockPinnedFetch).toHaveBeenCalledWith('https://api.example.com/v1/models', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
      },
      signal: expect.any(AbortSignal),
    })
  })

  it('discovers Anthropic models with required headers and endpoint normalization', async () => {
    mockPinnedFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'claude-3', display_name: 'Claude 3' }] }), { status: 200 })
    )

    const response = await POST(
      request({
        baseUrl: 'http://anthropic.example.com',
        apiKey: 'anthropic-key',
        protocol: 'anthropic',
      }),
      {}
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      models: [{ id: 'claude-3', name: 'Claude 3' }],
    })
    expect(mockPinnedFetch).toHaveBeenCalledWith('http://anthropic.example.com/v1/models', {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'anthropic-key',
        'anthropic-version': '2023-06-01',
      },
      signal: expect.any(AbortSignal),
    })
  })

  it('returns structured failure and skips upstream fetch for blocked URLs', async () => {
    mockValidateUrlWithDNS.mockResolvedValue({ isValid: false, error: 'Custom LLM endpoint resolves to a blocked IP address' })

    const response = await POST(request({ baseUrl: 'http://127.0.0.1:9000', protocol: 'openai' }), {})

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Custom LLM endpoint resolves to a blocked IP address',
      models: [],
    })
    expect(mockCreatePinnedFetch).not.toHaveBeenCalled()
    expect(mockPinnedFetch).not.toHaveBeenCalled()
  })

  it('sanitizes non-2xx upstream failures', async () => {
    mockPinnedFetch.mockResolvedValue(new Response('secret upstream details', { status: 503 }))

    const response = await POST(
      request({ baseUrl: 'https://api.example.com/v1', protocol: 'openai' }),
      {}
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Upstream error (503)',
      models: [],
    })
  })

  it('returns structured failure for network and JSON errors', async () => {
    mockPinnedFetch.mockRejectedValueOnce(new Error('network secret'))
    const networkResponse = await POST(
      request({ baseUrl: 'https://api.example.com/v1', protocol: 'openai' }),
      {}
    )
    expect(networkResponse.status).toBe(500)
    await expect(networkResponse.json()).resolves.toMatchObject({
      success: false,
      models: [],
    })

    mockPinnedFetch.mockResolvedValueOnce(new Response('{not-json', { status: 200 }))
    const jsonResponse = await POST(
      request({ baseUrl: 'https://api.example.com/v1', protocol: 'openai' }),
      {}
    )
    expect(jsonResponse.status).toBe(500)
    await expect(jsonResponse.json()).resolves.toMatchObject({
      success: false,
      models: [],
    })
  })

  it('omits auth headers when apiKey is absent and normalizes base URL', async () => {
    const response = await POST(
      request({ baseUrl: 'https://api.example.com///', protocol: 'openai' }),
      {}
    )

    expect(response.status).toBe(200)
    expect(mockPinnedFetch).toHaveBeenCalledWith('https://api.example.com/v1/models', {
      headers: { 'Content-Type': 'application/json' },
      signal: expect.any(AbortSignal),
    })
  })

  it('requires private endpoint opt-in for literal localhost', async () => {
    mockValidateUrlWithDNS.mockResolvedValue({
      isValid: false,
      error: 'Custom LLM endpoint cannot point to localhost',
    })

    const response = await POST(
      request({ baseUrl: 'http://127.0.0.1:8080', protocol: 'openai' }),
      {}
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      models: [],
    })
    expect(mockValidateUrlWithDNS).toHaveBeenCalledWith(
      'http://127.0.0.1:8080',
      'Custom LLM endpoint',
      {
        allowHttp: true,
        allowLocalhost: false,
      }
    )
    expect(mockPinnedFetch).not.toHaveBeenCalled()
  })
})
