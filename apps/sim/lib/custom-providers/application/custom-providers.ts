import { AuditAction, AuditResourceType } from '@sim/audit'
import { db } from '@sim/db'
import { workspaceCustomEndpoints } from '@sim/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { decryptSecret, encryptSecret } from '@/lib/core/security/encryption'
import { defineAuthorizedWorkspaceUseCase } from '@/lib/core/application'
import { OrchestrationError } from '@/lib/core/orchestration/types'
import { generateShortId } from '@sim/utils/id'
import { resolveActiveWorkspaceApplicationContext } from '@/lib/workspaces/application/workspace-context'
import { customProviderOperations } from '@/lib/custom-providers/application/operations'
import {
  normalizeAndDedupeModelIds,
  normalizeModelKey,
  parseCustomModelId,
} from '@/providers/custom-model'

export interface CustomProviderInput {
  workspaceId: string
  name: string
  protocol: 'openai' | 'anthropic'
  baseUrl: string
  apiKey?: string
  models: string[]
}

function normalizeSavedModelIds(models: string[]): string[] {
  const normalized = normalizeAndDedupeModelIds(models)
  if (normalized.duplicateModelIds.length > 0) {
    throw new OrchestrationError('validation', 'Duplicate model IDs are not allowed')
  }
  return normalized.models
}

type EndpointRow = typeof workspaceCustomEndpoints.$inferSelect

function maskedApiKey(value: string | null): string | null {
  if (!value) return null
  return value.length <= 8 ? '••••••••' : `${value.slice(0, 4)}...${value.slice(-4)}`
}

function present(row: EndpointRow, apiKey: string | null = null) {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol as 'openai' | 'anthropic',
    baseUrl: row.baseUrl,
    hasApiKey: Boolean(row.encryptedApiKey),
    maskedApiKey: maskedApiKey(apiKey),
    models: row.models,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function getEndpoint(id: string, workspaceId: string) {
  const [row] = await db
    .select()
    .from(workspaceCustomEndpoints)
    .where(and(eq(workspaceCustomEndpoints.id, id), eq(workspaceCustomEndpoints.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw new OrchestrationError('not_found', 'Custom provider not found')
  return row
}

/**
 * Resolves saved custom-provider connection details for an already-authorized
 * workspace execution. Plaintext API keys stay inside server-side execution.
 */
export async function resolveCustomProviderForExecution(input: {
  model: string
  providerId: 'custom-openai' | 'custom-anthropic'
  workspaceId: string
}): Promise<{ apiKey?: string; endpoint: string } | null> {
  const parsed = parseCustomModelId(input.model)
  if (!parsed || parsed.providerId !== input.providerId || !parsed.customProviderId) return null

  const [row] = await db
    .select()
    .from(workspaceCustomEndpoints)
    .where(
      and(
        eq(workspaceCustomEndpoints.id, parsed.customProviderId),
        eq(workspaceCustomEndpoints.workspaceId, input.workspaceId)
      )
    )
    .limit(1)

  if (!row) throw new OrchestrationError('not_found', 'Custom provider not found')
  if (row.protocol !== (input.providerId === 'custom-anthropic' ? 'anthropic' : 'openai')) {
    throw new OrchestrationError('validation', 'Custom provider protocol does not match model')
  }
  if (!row.models.some((model) => normalizeModelKey(model) === normalizeModelKey(parsed.modelId))) {
    throw new OrchestrationError('validation', 'Model is not configured for custom provider')
  }

  if (!row.encryptedApiKey) return { endpoint: row.baseUrl }
  const { decrypted } = await decryptSecret(row.encryptedApiKey)
  return { apiKey: decrypted, endpoint: row.baseUrl }
}

export const listCustomProviders = defineAuthorizedWorkspaceUseCase({
  operation: customProviderOperations.list,
  resolveContext: ({ input }: { input: { workspaceId: string } }) =>
    resolveActiveWorkspaceApplicationContext(input.workspaceId),
  authorizationOptions: {},
  execute: async ({ context }) => {
    const rows = await db
      .select()
      .from(workspaceCustomEndpoints)
      .where(eq(workspaceCustomEndpoints.workspaceId, context.workspaceId))
      .orderBy(asc(workspaceCustomEndpoints.name))
    const providers = await Promise.all(
      rows.map(async (row) => {
        if (!row.encryptedApiKey) return present(row)
        try {
          const { decrypted } = await decryptSecret(row.encryptedApiKey)
          return present(row, decrypted)
        } catch {
          return present(row)
        }
      })
    )
    return { providers }
  },
})

export const createCustomProvider = defineAuthorizedWorkspaceUseCase({
  operation: customProviderOperations.create,
  resolveContext: ({ input }: { input: CustomProviderInput }) =>
    resolveActiveWorkspaceApplicationContext(input.workspaceId),
  authorizationOptions: {},
  execute: async ({ input, principal }) => {
    const encryptedApiKey = input.apiKey?.trim() ? (await encryptSecret(input.apiKey)).encrypted : null
    const now = new Date()
    const [row] = await db
      .insert(workspaceCustomEndpoints)
      .values({
        id: generateShortId(),
        workspaceId: input.workspaceId,
        name: input.name,
        protocol: input.protocol,
        baseUrl: input.baseUrl,
        encryptedApiKey,
        models: normalizeSavedModelIds(input.models),
        createdBy: principal.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('Failed to create custom provider')
    return present(row, input.apiKey ?? null)
  },
  projectAudit: ({ result }) => ({
    action: AuditAction.CUSTOM_ENDPOINT_CREATED,
    resourceType: AuditResourceType.CUSTOM_ENDPOINT,
    resourceId: result.id,
    resourceName: result.name,
  }),
})

export const updateCustomProvider = defineAuthorizedWorkspaceUseCase({
  operation: customProviderOperations.update,
  resolveContext: ({ input }: { input: CustomProviderInput & { id: string } }) =>
    resolveActiveWorkspaceApplicationContext(input.workspaceId),
  authorizationOptions: {},
  execute: async ({ input }) => {
    const existing = await getEndpoint(input.id, input.workspaceId)
    const encryptedApiKey =
      input.apiKey === undefined
        ? existing.encryptedApiKey
        : input.apiKey.trim()
          ? (await encryptSecret(input.apiKey)).encrypted
          : null
    const [row] = await db
      .update(workspaceCustomEndpoints)
      .set({
        name: input.name,
        protocol: input.protocol,
        baseUrl: input.baseUrl,
        encryptedApiKey,
        models: normalizeSavedModelIds(input.models),
        updatedAt: new Date(),
      })
      .where(eq(workspaceCustomEndpoints.id, existing.id))
      .returning()
    if (!row) throw new Error('Failed to update custom provider')
    return present(row, input.apiKey ?? null)
  },
  projectAudit: ({ result }) => ({
    action: AuditAction.CUSTOM_ENDPOINT_UPDATED,
    resourceType: AuditResourceType.CUSTOM_ENDPOINT,
    resourceId: result.id,
    resourceName: result.name,
  }),
})

export const deleteCustomProvider = defineAuthorizedWorkspaceUseCase({
  operation: customProviderOperations.delete,
  resolveContext: ({ input }: { input: { id: string; workspaceId: string } }) =>
    resolveActiveWorkspaceApplicationContext(input.workspaceId),
  authorizationOptions: {},
  execute: async ({ input }) => {
    const existing = await getEndpoint(input.id, input.workspaceId)
    await db.delete(workspaceCustomEndpoints).where(eq(workspaceCustomEndpoints.id, existing.id))
    return { success: true as const, id: existing.id, name: existing.name }
  },
  projectAudit: ({ result }) => ({
    action: AuditAction.CUSTOM_ENDPOINT_DELETED,
    resourceType: AuditResourceType.CUSTOM_ENDPOINT,
    resourceId: result.id,
    resourceName: result.name,
  }),
})
