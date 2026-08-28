import { ErrorExtractorId } from '@/tools/error-extractors'
import { buildQuickBooksUpdateBillPaymentBody } from '@/tools/quickbooks/purchasing_utils'
import type {
  QuickBooksMutationResponse,
  QuickBooksPurchasingTransaction,
  QuickBooksUpdateBillPaymentParams,
} from '@/tools/quickbooks/types'
import {
  QUICKBOOKS_MUTATION_OUTPUTS,
  QUICKBOOKS_PURCHASING_TRANSACTION_PROPERTIES,
} from '@/tools/quickbooks/types'
import {
  buildQuickBooksEntityUrl,
  executeQuickBooksFullUpdate,
  getQuickBooksToolHeaders,
  transformQuickBooksMutationResponse,
} from '@/tools/quickbooks/utils'
import type { ToolConfig } from '@/tools/types'

export const quickbooksUpdateBillPaymentTool: ToolConfig<
  QuickBooksUpdateBillPaymentParams,
  QuickBooksMutationResponse<QuickBooksPurchasingTransaction>
> = {
  id: 'quickbooks_update_bill_payment',
  name: 'QuickBooks Update Bill Payment',
  description: 'Read, merge, and full-update a BillPayment without changing allocations',
  version: '1.0.0',
  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'QuickBooks OAuth access token',
    },
    realmId: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'QuickBooks company ID derived from the connected credential',
    },
    billPaymentId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'BillPayment ID to update',
    },
    syncToken: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Current BillPayment sync token',
    },
    vendorId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Replacement vendor ID; omit to preserve the current vendor',
    },
    transactionDate: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Replacement payment date in YYYY-MM-DD format',
    },
    privateNote: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Replacement internal note',
    },
  },
  oauth: {
    required: true,
    provider: 'quickbooks',
    requiredScopes: ['com.intuit.quickbooks.accounting'],
  },
  errorExtractor: ErrorExtractorId.QUICKBOOKS_FAULT,
  request: {
    url: (p) => buildQuickBooksEntityUrl(p.realmId, 'billpayment').toString(),
    method: 'POST',
    headers: (p) => getQuickBooksToolHeaders(p.accessToken, 'application/json'),
    body: buildQuickBooksUpdateBillPaymentBody,
    retry: { enabled: false },
  },
  directExecution: (params, signal) =>
    executeQuickBooksFullUpdate({
      params,
      signal,
      entity: 'BillPayment',
      resource: 'billpayment',
      recordId: params.billPaymentId,
      syncToken: params.syncToken,
      buildPatch: buildQuickBooksUpdateBillPaymentBody,
    }),
  transformResponse: (r) =>
    transformQuickBooksMutationResponse<QuickBooksPurchasingTransaction>(r, 'BillPayment'),
  outputs: {
    record: {
      type: 'json',
      description: 'Updated native QuickBooks BillPayment',
      properties: QUICKBOOKS_PURCHASING_TRANSACTION_PROPERTIES,
    },
    ...QUICKBOOKS_MUTATION_OUTPUTS,
  },
}
