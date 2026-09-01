import { z } from 'zod'
import { normalizeModelKey } from '@/providers/custom-model'
import { defineRouteContract } from '@/lib/api/contracts/types'
import { workspaceIdSchema } from '@/lib/api/contracts/primitives'

export const discoverCustomModelsBodySchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .min(1, 'Base URL is required')
    .url('Base URL must be a valid URL')
    .refine(
      (value) => {
        const url = new URL(value)
        return !url.search && !url.hash
      },
      'Base URL must not include query parameters or fragments'
    ),
  apiKey: z.string().optional(),
  protocol: z.enum(['openai', 'anthropic']).default('openai'),
})

export const customModelItemSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  object: z.string().optional(),
})

export const discoverCustomModelsResponseSchema = z.object({
  success: z.boolean(),
  models: z.array(customModelItemSchema),
  error: z.string().optional(),
})

export type DiscoverCustomModelsInput = z.input<typeof discoverCustomModelsBodySchema>
export type DiscoverCustomModelsResponse = z.output<typeof discoverCustomModelsResponseSchema>

export const discoverCustomModelsContract = defineRouteContract({
  method: 'POST',
  path: '/api/providers/custom/discover',
  body: discoverCustomModelsBodySchema,
  response: {
    mode: 'json',
    schema: discoverCustomModelsResponseSchema,
  },
})

export const customProviderIdSchema = z.string().trim().min(1)
export const customProviderProtocolSchema = z.enum(['openai', 'anthropic'])
export const customProviderModelSchema = z.string().trim().min(1).max(200)
const customProviderModelsSchema = z
  .array(customProviderModelSchema)
  .superRefine((models, ctx) => {
    const seen = new Set<string>()
    models.forEach((model, index) => {
      const key = normalizeModelKey(model)
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate model IDs are not allowed',
          path: [index],
        })
      } else {
        seen.add(key)
      }
    })
  })
export const customProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  protocol: customProviderProtocolSchema,
  baseUrl: z.string().url(),
  hasApiKey: z.boolean(),
  maskedApiKey: z.string().nullable(),
  models: customProviderModelsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CustomProvider = z.output<typeof customProviderSchema>

const customProviderInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  name: z.string().trim().min(1, 'Provider name is required').max(120),
  baseUrl: z.string().trim().url('Base URL must be a valid URL'),
  apiKey: z.string().optional(),
  protocol: customProviderProtocolSchema,
  models: customProviderModelsSchema
    .min(1, 'Select at least one model')
    .max(200),
})

const customProviderParamsSchema = z.object({ id: customProviderIdSchema })

export const listCustomProvidersContract = defineRouteContract({
  method: 'GET',
  path: '/api/providers/custom',
  query: z.object({ workspaceId: workspaceIdSchema }),
  response: { mode: 'json', schema: z.object({ providers: z.array(customProviderSchema) }) },
})

export const createCustomProviderContract = defineRouteContract({
  method: 'POST',
  path: '/api/providers/custom',
  body: customProviderInputSchema,
  response: { mode: 'json', schema: z.object({ success: z.literal(true), provider: customProviderSchema }) },
})

export const updateCustomProviderContract = defineRouteContract({
  method: 'PUT',
  path: '/api/providers/custom/[id]',
  params: customProviderParamsSchema,
  body: customProviderInputSchema,
  response: { mode: 'json', schema: z.object({ success: z.literal(true), provider: customProviderSchema }) },
})

export const deleteCustomProviderContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/providers/custom/[id]',
  params: customProviderParamsSchema,
  body: z.object({ workspaceId: workspaceIdSchema }),
  response: { mode: 'json', schema: z.object({ success: z.literal(true) }) },
})

export type ListCustomProvidersResponse = z.output<typeof listCustomProvidersContract.response.schema>
export type CreateCustomProviderInput = z.input<typeof customProviderInputSchema>
export type UpdateCustomProviderInput = CreateCustomProviderInput & { id: string }
