import { defineWorkspaceOperation } from '@/lib/core/application'

const SESSION_ONLY = {
  principalKinds: ['session'] as const,
} as const

export const customProviderOperations = {
  list: defineWorkspaceOperation({
    id: 'custom_provider.list',
    minimumRole: 'read',
    workspaceApiKey: 'deny',
    ...SESSION_ONLY,
  }),
  create: defineWorkspaceOperation({
    id: 'custom_provider.create',
    minimumRole: 'write',
    workspaceApiKey: 'deny',
    ...SESSION_ONLY,
  }),
  update: defineWorkspaceOperation({
    id: 'custom_provider.update',
    minimumRole: 'write',
    workspaceApiKey: 'deny',
    ...SESSION_ONLY,
  }),
  delete: defineWorkspaceOperation({
    id: 'custom_provider.delete',
    minimumRole: 'write',
    workspaceApiKey: 'deny',
    ...SESSION_ONLY,
  }),
} as const
