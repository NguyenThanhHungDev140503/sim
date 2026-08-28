import { ErrorExtractorId } from '@/tools/error-extractors'
import {
  buildQuickBooksUpdatePaymentBody,
  parseQuickBooksInvoiceAllocations,
} from '@/tools/quickbooks/sales_utils'
import type {
  QuickBooksMutationResponse,
  QuickBooksSalesTransaction,
  QuickBooksUpdateCustomerPaymentParams,
} from '@/tools/quickbooks/types'
import {
  QUICKBOOKS_MUTATION_OUTPUTS,
  QUICKBOOKS_SALES_TRANSACTION_PROPERTIES,
} from '@/tools/quickbooks/types'
import {
  buildQuickBooksEntityUrl,
  buildQuickBooksFullUpdateBody,
  getQuickBooksDirectExecutionError,
  getQuickBooksToolHeaders,
  transformQuickBooksEntityResponse,
  transformQuickBooksMutationResponse,
} from '@/tools/quickbooks/utils'
import type { ToolConfig } from '@/tools/types'

export const quickbooksUpdateCustomerPaymentTool: ToolConfig<
  QuickBooksUpdateCustomerPaymentParams,
  QuickBooksMutationResponse<QuickBooksSalesTransaction>
> = {
  id: 'quickbooks_update_customer_payment',
  name: 'QuickBooks Update Customer Payment',
  description: 'Read, merge, and full-update a customer payment using its current sync token',
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
    paymentId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Payment ID to update',
    },
    syncToken: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Current payment sync token',
    },
    customerId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Replacement customer ID',
    },
    totalAmount: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Replacement positive payment total',
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
    paymentReferenceNumber: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Replacement payment reference number',
    },
    paymentMethodId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Replacement payment method ID',
    },
    depositAccountId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Replacement deposit account ID',
    },
    invoiceAllocations: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Bounded invoice allocations to apply. Each entry sets the amount applied to that invoice; invoices already applied on the payment and not listed here keep their current amounts',
    },
    unapplyOmittedInvoices: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description:
        'Replace the payment allocations outright. Every invoice not listed in invoiceAllocations is UNAPPLIED and returns to open',
    },
  },
  oauth: {
    required: true,
    provider: 'quickbooks',
    requiredScopes: ['com.intuit.quickbooks.accounting'],
  },
  errorExtractor: ErrorExtractorId.QUICKBOOKS_FAULT,
  request: {
    url: (params) => buildQuickBooksEntityUrl(params.realmId, 'payment').toString(),
    method: 'POST',
    headers: (params) => getQuickBooksToolHeaders(params.accessToken, 'application/json'),
    body: (params) => buildQuickBooksUpdatePaymentBody(params),
    retry: { enabled: false },
  },
  /**
   * QuickBooks only documents full Payment updates and treats Payment lines as
   * all-or-none. Read the complete payment first, preserve its writable fields,
   * and merge supplied allocations unless the caller explicitly replaces them.
   */
  directExecution: async (params, signal) => {
    const paymentId = params.paymentId?.trim()
    if (!paymentId) throw new Error('paymentId is required')

    // Validate bounded allocations before the preservation read so malformed or
    // duplicate invoice references never contact QuickBooks.
    parseQuickBooksInvoiceAllocations(params.invoiceAllocations)

    const syncToken = params.syncToken?.trim()
    if (!syncToken) throw new Error('syncToken is required')
    const readResponse = await fetch(
      buildQuickBooksEntityUrl(params.realmId, 'payment', paymentId),
      {
        method: 'GET',
        headers: getQuickBooksToolHeaders(params.accessToken),
        signal,
      }
    )
    if (!readResponse.ok) {
      throw await getQuickBooksDirectExecutionError(readResponse, 'Payment', signal)
    }
    const { item: currentPayment } =
      await transformQuickBooksEntityResponse<QuickBooksSalesTransaction>(
        readResponse,
        'Payment',
        signal
      )
    const currentId = typeof currentPayment.Id === 'string' ? currentPayment.Id.trim() : ''
    const currentSyncToken =
      typeof currentPayment.SyncToken === 'string' ? currentPayment.SyncToken.trim() : ''
    if (currentId !== paymentId) {
      throw new Error('QuickBooks Payment read returned an unexpected record ID')
    }
    if (currentSyncToken !== syncToken) {
      throw new Error(
        `QuickBooks payment ${paymentId} changed since sync token ${syncToken} was read (current sync token ${currentSyncToken}). Re-read the payment and retry.`
      )
    }
    signal?.throwIfAborted()

    const patch = buildQuickBooksUpdatePaymentBody(params, currentPayment)
    const fullBody = buildQuickBooksFullUpdateBody(
      currentPayment as QuickBooksSalesTransaction & Record<string, unknown>,
      patch,
      paymentId,
      syncToken
    )

    const updateResponse = await fetch(buildQuickBooksEntityUrl(params.realmId, 'payment'), {
      method: 'POST',
      headers: getQuickBooksToolHeaders(params.accessToken, 'application/json'),
      body: JSON.stringify(fullBody),
      signal,
    })
    if (!updateResponse.ok)
      throw await getQuickBooksDirectExecutionError(updateResponse, 'Payment', signal)
    return transformQuickBooksMutationResponse<QuickBooksSalesTransaction>(
      updateResponse,
      'Payment',
      undefined,
      signal
    )
  },
  transformResponse: (response) =>
    transformQuickBooksMutationResponse<QuickBooksSalesTransaction>(response, 'Payment'),
  outputs: {
    record: {
      type: 'json',
      description: 'Updated native QuickBooks Payment',
      properties: QUICKBOOKS_SALES_TRANSACTION_PROPERTIES,
    },
    ...QUICKBOOKS_MUTATION_OUTPUTS,
  },
}
