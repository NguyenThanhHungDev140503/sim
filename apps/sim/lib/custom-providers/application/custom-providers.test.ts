/**
 * CRUD application tests for workspace custom providers.
 *
 * @vitest-environment node
 */
import {
  dbChainMockFns,
  databaseMock,
  queueTableRows,
  resetDbChainMock,
  schemaMock,
} from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const customEndpointsTable = {
  id: 'workspaceCustomEndpoints.id',
  workspaceId: 'workspaceCustomEndpoints.workspaceId',
  name: 'workspaceCustomEndpoints.name',
  protocol: 'workspaceCustomEndpoints.protocol',
  baseUrl: 'workspaceCustomEndpoints.baseUrl',
  encryptedApiKey: 'workspaceCustomEndpoints.encryptedApiKey',
}

vi.mock('@sim/db/schema', () => ({
  ...schemaMock,
  workspaceCustomEndpoints: customEndpointsTable,
}))
vi.mock('@sim/db', () => databaseMock)
vi.mock('@/lib/core/application/workspace-authorization', () => ({
  authorizeWorkspaceOperation: vi.fn(),
  requireAllowedWorkspacePrincipal: vi.fn(),
}))
vi.mock('@/lib/core/security/encryption', () => ({
  encryptSecret: vi.fn(async (secret: string) => ({ encrypted: `encrypted:${secret}` })),
  decryptSecret: vi.fn(async (secret: string) => ({
    decrypted: secret.replace('encrypted:', ''),
  })),
}))

import {
  createCustomProvider,
  deleteCustomProvider,
  listCustomProviders,
  updateCustomProvider,
} from '@/lib/custom-providers/application/custom-providers'

const workspaceContext = {
  id: 'workspace-1',
  organizationId: null,
  allowPersonalApiKeys: true,
  billedAccountUserId: 'user-1',
}

const providerRow = {
  id: 'provider-1',
  workspaceId: 'workspace-1',
  name: 'Gateway',
  protocol: 'openai',
  baseUrl: 'https://example.com/v1',
  encryptedApiKey: 'encrypted:secret',
  models: ['model-a'],
  createdBy: 'user-1',
  createdAt: new Date('2026-08-30T00:00:00.000Z'),
  updatedAt: new Date('2026-08-30T00:00:00.000Z'),
}

const principal = { kind: 'session' as const, userId: 'user-1', sessionId: 'session-1' }

describe('custom provider application CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    queueTableRows(schemaMock.workspace, [workspaceContext])
  })

  it('lists providers with masked, never decrypted API keys', async () => {
    queueTableRows(customEndpointsTable, [providerRow])

    const result = await listCustomProviders.execute({
      principal,
      input: { workspaceId: 'workspace-1' },
    })

    expect(result.providers[0]).toMatchObject({
      id: 'provider-1',
      maskedApiKey: 'secr...cret',
      hasApiKey: true,
      models: ['model-a'],
    })
    expect(result.providers[0]).not.toHaveProperty('encryptedApiKey')
  })

  it('creates provider with encrypted key and selected models', async () => {
    dbChainMockFns.returning.mockReturnValueOnce([{ ...providerRow, id: 'provider-2' }])

    const result = await createCustomProvider.execute({
      principal,
      input: {
        workspaceId: 'workspace-1',
        name: 'Gateway',
        protocol: 'openai',
        baseUrl: 'https://example.com/v1',
        apiKey: 'secret',
        models: ['model-a'],
      },
    })

    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedApiKey: 'encrypted:secret', models: ['model-a'] })
    )
    expect(result.hasApiKey).toBe(true)
  })

  it('updates provider fields and preserves key when key omitted', async () => {
    queueTableRows(customEndpointsTable, [providerRow])
    dbChainMockFns.returning.mockReturnValueOnce([providerRow])

    await updateCustomProvider.execute({
      principal,
      input: {
        id: 'provider-1',
        workspaceId: 'workspace-1',
        name: 'Updated Gateway',
        protocol: 'anthropic',
        baseUrl: 'https://example.com',
        models: ['claude'],
      },
    })

    expect(dbChainMockFns.set).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedApiKey: 'encrypted:secret', models: ['claude'] })
    )
  })

  it('deletes only provider in asserted workspace', async () => {
    queueTableRows(customEndpointsTable, [providerRow])

    const result = await deleteCustomProvider.execute({
      principal,
      input: { id: 'provider-1', workspaceId: 'workspace-1' },
    })

    expect(result).toEqual({ success: true, id: 'provider-1', name: 'Gateway' })
    expect(dbChainMockFns.delete).toHaveBeenCalled()
  })
})
