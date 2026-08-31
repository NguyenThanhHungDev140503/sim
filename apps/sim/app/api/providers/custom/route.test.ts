/**
 * CRUD route boundary tests for custom providers.
 *
 * @vitest-environment node
 */
import { authMockFns, createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { DELETE } from '@/app/api/providers/custom/[id]/route'
import { PUT } from '@/app/api/providers/custom/[id]/route'
import { GET, POST } from '@/app/api/providers/custom/route'

describe('custom provider CRUD routes', () => {
  beforeEach(() => {
    authMockFns.mockGetSession.mockResolvedValue(null)
  })

  it.each([
    ['GET', GET, createMockRequest('GET', undefined, { workspaceId: 'workspace-1' })],
    ['POST', POST, createMockRequest('POST', {})],
    ['PUT', PUT, createMockRequest('PUT', {}, { id: 'provider-1' })],
    ['DELETE', DELETE, createMockRequest('DELETE', { workspaceId: 'workspace-1' }, { id: 'provider-1' })],
  ])('%s rejects unauthenticated access before CRUD execution', async (_method, handler, request) => {
    const response = await handler(request)
    expect(response.status).toBe(401)
  })
})
