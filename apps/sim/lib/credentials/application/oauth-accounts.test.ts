/**
 * @vitest-environment node
 */
import { account, credential } from '@sim/db/schema'
import {
  auditMock,
  auditMockFns,
  dbChainMockFns,
  queueTableRows,
  resetDbChainMock,
} from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteCredential: vi.fn(),
  capture: vi.fn(),
  revokeQuickBooksToken: vi.fn(),
}))

vi.mock('@sim/audit', () => auditMock)
vi.mock('@/lib/credentials/orchestration', () => ({
  deleteCredentialRecord: mocks.deleteCredential,
}))
vi.mock('@/lib/oauth/quickbooks', () => ({
  revokeQuickBooksToken: mocks.revokeQuickBooksToken,
}))
vi.mock('@/lib/posthog/server', () => ({ captureServerEvent: mocks.capture }))

import { disconnectOAuthUseCase } from '@/lib/credentials/application/oauth-accounts'

const firstCredential = {
  id: 'credential-1',
  workspaceId: 'workspace-1',
  type: 'oauth' as const,
  displayName: 'First Google account',
  description: null,
  providerId: 'google-email',
  accountId: 'account-1',
  envKey: null,
  envOwnerUserId: null,
  encryptedServiceAccountKey: null,
  createdBy: 'user-1',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
}

describe('OAuth account application operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mocks.revokeQuickBooksToken.mockResolvedValue(undefined)
  })

  it('audits and captures committed deletions before rethrowing a later failure', async () => {
    const secondCredential = {
      ...firstCredential,
      id: 'credential-2',
      displayName: 'Second Google account',
      accountId: 'account-2',
    }
    queueTableRows(account, [{ id: 'account-1' }, { id: 'account-2' }])
    queueTableRows(credential, [firstCredential, secondCredential])
    mocks.deleteCredential
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('Second credential delete failed'))

    await expect(
      disconnectOAuthUseCase.execute({
        principal: { kind: 'session', userId: 'user-1', sessionId: 'session-1' },
        input: { provider: 'google' },
      })
    ).rejects.toMatchObject({
      name: 'OAuthDisconnectPartialFailureError',
      credentials: [firstCredential],
    })

    expect(auditMockFns.mockRecordAudit).toHaveBeenCalledTimes(1)
    expect(auditMockFns.mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'credential.deleted',
        resourceId: firstCredential.id,
        metadata: expect.objectContaining({ reason: 'oauth_disconnect' }),
      })
    )
    expect(mocks.capture).toHaveBeenCalledWith(
      'user-1',
      'credential_deleted',
      expect.objectContaining({
        provider_id: 'google-email',
        workspace_id: 'workspace-1',
      }),
      { groups: { workspace: 'workspace-1' } }
    )
  })

  it('revokes the QuickBooks refresh token before deleting the local account', async () => {
    queueTableRows(account, [
      {
        id: 'account-1',
        providerId: 'quickbooks',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    ])
    queueTableRows(credential, [])

    await disconnectOAuthUseCase.execute({
      principal: { kind: 'session', userId: 'user-1', sessionId: 'session-1' },
      input: { provider: 'quickbooks', accountId: 'account-1' },
    })

    expect(mocks.revokeQuickBooksToken).toHaveBeenCalledWith(
      'refresh-token',
      expect.any(AbortSignal)
    )
    expect(dbChainMockFns.delete).toHaveBeenCalled()
    expect(mocks.revokeQuickBooksToken.mock.invocationCallOrder[0]).toBeLessThan(
      dbChainMockFns.delete.mock.invocationCallOrder[0]
    )
  })

  it('falls back to the QuickBooks access token when no refresh token is stored', async () => {
    queueTableRows(account, [
      {
        id: 'account-1',
        providerId: 'quickbooks',
        accessToken: 'access-token',
        refreshToken: null,
      },
    ])
    queueTableRows(credential, [])

    await disconnectOAuthUseCase.execute({
      principal: { kind: 'session', userId: 'user-1', sessionId: 'session-1' },
      input: { provider: 'quickbooks', accountId: 'account-1' },
    })

    expect(mocks.revokeQuickBooksToken).toHaveBeenCalledWith(
      'access-token',
      expect.any(AbortSignal)
    )
  })

  it('keeps QuickBooks credentials locally when Intuit revocation fails', async () => {
    queueTableRows(account, [
      {
        id: 'account-1',
        providerId: 'quickbooks',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    ])
    mocks.revokeQuickBooksToken.mockRejectedValueOnce(new Error('Intuit unavailable'))

    await expect(
      disconnectOAuthUseCase.execute({
        principal: { kind: 'session', userId: 'user-1', sessionId: 'session-1' },
        input: { provider: 'quickbooks', accountId: 'account-1' },
      })
    ).rejects.toMatchObject({
      name: 'OAuthProviderRevocationError',
      message: 'Unable to revoke QuickBooks access. Please try again.',
    })

    expect(mocks.deleteCredential).not.toHaveBeenCalled()
    expect(dbChainMockFns.delete).not.toHaveBeenCalled()
  })

  it('removes a tokenless QuickBooks account without calling Intuit', async () => {
    queueTableRows(account, [
      {
        id: 'account-1',
        providerId: 'quickbooks',
        accessToken: null,
        refreshToken: null,
      },
    ])
    queueTableRows(credential, [])

    await disconnectOAuthUseCase.execute({
      principal: { kind: 'session', userId: 'user-1', sessionId: 'session-1' },
      input: { provider: 'quickbooks', accountId: 'account-1' },
    })

    expect(mocks.revokeQuickBooksToken).not.toHaveBeenCalled()
    expect(dbChainMockFns.delete).toHaveBeenCalled()
  })

  it('does not revoke tokens for non-QuickBooks providers', async () => {
    queueTableRows(account, [
      {
        id: 'account-1',
        providerId: 'google-email',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    ])
    queueTableRows(credential, [])

    await disconnectOAuthUseCase.execute({
      principal: { kind: 'session', userId: 'user-1', sessionId: 'session-1' },
      input: { provider: 'google', accountId: 'account-1' },
    })

    expect(mocks.revokeQuickBooksToken).not.toHaveBeenCalled()
    expect(dbChainMockFns.delete).toHaveBeenCalled()
  })
})
