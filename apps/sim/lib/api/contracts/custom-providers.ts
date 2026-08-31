import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts/types'

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
  id: z.string().min(1),
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
