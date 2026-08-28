/**
 * @vitest-environment node
 */
import { createExecutionContext } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addAttachment: vi.fn(),
  downloadDocument: vi.fn(),
}))

vi.mock('@/lib/internal/quickbooks/operations', () => ({
  QuickBooksInternalOperationError: class QuickBooksInternalOperationError extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message)
    }
  },
  executeQuickBooksAddAttachment: mocks.addAttachment,
  executeQuickBooksDownloadDocument: mocks.downloadDocument,
}))

import { executeQuickBooksTool } from '@/lib/internal/quickbooks/execute-tool'
import type { InternalToolOperationCall } from '@/lib/internal/tool-operations/types'

function request(overrides: Partial<InternalToolOperationCall> = {}): InternalToolOperationCall {
  return {
    toolId: 'quickbooks_download_attachment',
    input: {
      accessToken: 'token',
      realmId: '123',
      attachmentId: 'attachment-1',
    },
    headers: new Headers(),
    context: {
      ...createExecutionContext({ workflowId: 'workflow-1' }),
      userId: 'user-1',
      workspaceId: 'workspace-1',
      executionId: 'execution-1',
    },
    requestId: 'request-1',
    ...overrides,
  }
}

describe('executeQuickBooksTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.addAttachment.mockResolvedValue({ attachmentId: 'attachment-1' })
    mocks.downloadDocument.mockResolvedValue({ attachmentId: 'attachment-1' })
  })

  it('dispatches downloads with trusted execution context', async () => {
    const controller = new AbortController()

    const response = await executeQuickBooksTool(request({ signal: controller.signal }))

    expect(response.status).toBe(200)
    expect(mocks.downloadDocument).toHaveBeenCalledWith(
      {
        accessToken: 'token',
        realmId: '123',
        documentKind: 'attachment',
        attachmentId: 'attachment-1',
      },
      {
        userId: 'user-1',
        requestId: 'request-1',
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
        signal: controller.signal,
      }
    )
  })

  it('rejects missing trusted user identity', async () => {
    const response = await executeQuickBooksTool(request({ context: { workflowId: 'workflow-1' } }))

    expect(response.status).toBe(401)
    expect(mocks.downloadDocument).not.toHaveBeenCalled()
  })

  it('rejects malformed provider input', async () => {
    const response = await executeQuickBooksTool(request({ input: { accessToken: '' } }))

    expect(response.status).toBe(400)
    expect(mocks.downloadDocument).not.toHaveBeenCalled()
  })

  it('rejects oversized operation input before dispatch', async () => {
    const response = await executeQuickBooksTool(
      request({
        input: {
          accessToken: 'token',
          realmId: '123',
          attachmentId: 'attachment-1',
          extra: 'x'.repeat(1024 * 1024 + 1),
        },
      })
    )

    expect(response.status).toBe(413)
    expect(mocks.downloadDocument).not.toHaveBeenCalled()
  })

  it('propagates cancellation before validation or provider work', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))

    await expect(
      executeQuickBooksTool(request({ signal: controller.signal }))
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.downloadDocument).not.toHaveBeenCalled()
  })
})
