import {
  createCustomProviderContract,
  listCustomProvidersContract,
} from '@/lib/api/contracts/custom-providers'
import {
  defineInternalJsonRoute,
  internalOrchestrationErrorPolicy,
  internalRateLimits,
  internalSessionAuth,
} from '@/lib/api/server/routes'
import {
  createCustomProvider,
  listCustomProviders,
} from '@/lib/custom-providers/application/custom-providers'
import { customProviderOperations } from '@/lib/custom-providers/application/operations'

export const GET = defineInternalJsonRoute({
  contract: listCustomProvidersContract,
  auth: internalSessionAuth,
  operation: customProviderOperations.list,
  rateLimit: internalRateLimits.none({ reason: 'Preserve settings provider listing behavior' }),
  errorPolicy: internalOrchestrationErrorPolicy,
  mapInput: ({ query }) => ({ workspaceId: query.workspaceId }),
  useCase: listCustomProviders,
  present: (result) => result,
})

export const POST = defineInternalJsonRoute({
  contract: createCustomProviderContract,
  auth: internalSessionAuth,
  operation: customProviderOperations.create,
  rateLimit: internalRateLimits.none({ reason: 'Preserve settings provider creation behavior' }),
  errorPolicy: internalOrchestrationErrorPolicy,
  mapInput: ({ body }) => body,
  useCase: createCustomProvider,
  present: (provider) => ({ success: true as const, provider }),
})
