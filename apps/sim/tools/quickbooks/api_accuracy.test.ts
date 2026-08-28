/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  assertQuickBooksAttachmentExtension,
  getQuickBooksAttachmentTarget,
  getQuickBooksDocumentTransaction,
  validateQuickBooksAttachmentFileType,
} from '@/tools/quickbooks/documents_utils'
import { quickbooksEmailTransactionTool } from '@/tools/quickbooks/email_transaction'
import { quickbooksGetCompanyInfoTool } from '@/tools/quickbooks/get_company_info'
import type { QuickBooksAttachmentTargetType } from '@/tools/quickbooks/types'

describe('QuickBooks documented document operations', () => {
  it.each([
    ['credit_memo', 'CreditMemo', 'creditmemo'],
    ['estimate', 'Estimate', 'estimate'],
    ['invoice', 'Invoice', 'invoice'],
    ['payment', 'Payment', 'payment'],
    ['purchase_order', 'PurchaseOrder', 'purchaseorder'],
    ['refund_receipt', 'RefundReceipt', 'refundreceipt'],
    ['sales_receipt', 'SalesReceipt', 'salesreceipt'],
  ] as const)('maps %s to the documented entity and resource', (type, entity, resource) => {
    expect(getQuickBooksDocumentTransaction(type)).toEqual({ entity, resource })
  })

  it('requires the documented recipient override for Payment email', () => {
    expect(() =>
      quickbooksEmailTransactionTool.request.url({
        accessToken: 'token',
        realmId: '123',
        transactionType: 'payment',
        transactionId: 'payment-1',
        confirmSend: true,
      })
    ).toThrow('recipient is required')
  })

  it('rejects a successful-status email response without the documented entity', async () => {
    await expect(
      quickbooksEmailTransactionTool.transformResponse?.(
        Response.json({ time: '2026-08-27T00:00:00Z' }),
        {
          accessToken: 'token',
          realmId: '123',
          transactionType: 'invoice',
          transactionId: 'invoice-1',
          confirmSend: true,
        }
      )
    ).rejects.toThrow('missing a valid Invoice')
  })
})

describe('QuickBooks attachment contract', () => {
  it('supports customer and vendor profiles and excludes list items', () => {
    expect(getQuickBooksAttachmentTarget('customer')).toEqual({ entityType: 'Customer' })
    expect(getQuickBooksAttachmentTarget('vendor')).toEqual({ entityType: 'Vendor' })
    expect(() => getQuickBooksAttachmentTarget('item' as QuickBooksAttachmentTargetType)).toThrow(
      'Unsupported QuickBooks attachment target type'
    )
  })

  it('accepts documented TIFF files and rejects undocumented DOCX files', () => {
    expect(validateQuickBooksAttachmentFileType('scan.tiff', 'image/tiff')).toBe('image/tiff')
    expect(() => assertQuickBooksAttachmentExtension('contract.docx')).toThrow(
      'does not support the docx file type'
    )
  })
})

describe('QuickBooks sensitive output handling', () => {
  it('removes the company employer identifier from tool output', async () => {
    const result = await quickbooksGetCompanyInfoTool.transformResponse?.(
      Response.json({
        CompanyInfo: {
          Id: '123',
          CompanyName: 'Example Company',
          EmployerId: '12-3456789',
        },
      }),
      { accessToken: 'token', realmId: '123' }
    )

    expect(result?.output.company).toMatchObject({ Id: '123', CompanyName: 'Example Company' })
    expect(result?.output.company).not.toHaveProperty('EmployerId')
  })
})
