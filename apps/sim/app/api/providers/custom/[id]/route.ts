import {
  deleteCustomProviderContract,
  updateCustomProviderContract,
} from '@/lib/api/contracts/custom-providers'
import {
  defineInternalJsonRoute,
  internalOrchestrationErrorPolicy,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import {
  deleteCustomProvider,
  updateCustomProvider,
} from '@/lib/custom-providers/application/custom-providers'
import { customProviderOperations } from '@/lib/custom-providers/application/operations'

export const PUT = defineInternalJsonRoute({
  contract: updateCustomProviderContract,
  auth: internalSessionAuth,
  operation: customProviderOperations.update,
  rateLimit: internalRateLimits.none({ reason: 'Preserve settings provider update behavior' }),
  errorPolicy: internalOrchestrationErrorPolicy,
  mapInput: ({ params, body }) => ({ ...body, id: params.id }),
  useCase: updateCustomProvider,
  present: (provider) => ({ success: true as const, provider }),
})

export const DELETE = defineInternalJsonRoute({
  contract: deleteCustomProviderContract,
  auth: internalSessionAuth,
  operation: customProviderOperations.delete,
  rateLimit: internalRateLimits.none({ reason: 'Preserve settings provider deletion behavior' }),
  errorPolicy: internalOrchestrationErrorPolicy,
  mapInput: ({ params, body }) => ({ id: params.id, workspaceId: body.workspaceId }),
  useCase: deleteCustomProvider,
  present: () => ({ success: true as const }),
})
