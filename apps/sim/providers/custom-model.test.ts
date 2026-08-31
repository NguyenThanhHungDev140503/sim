/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildCustomModelId,
  normalizeModelId,
  parseCustomModelId,
} from '@/providers/custom-model'

describe('custom model ids', () => {
  it('normalizes ids and preserves duplicate models by provider', () => {
    const first = buildCustomModelId('custom-openai', 'Provider One', ' shared/model ')
    const second = buildCustomModelId('custom-openai', 'Provider Two', 'shared/model')

    expect(first).not.toBe(second)
    expect(parseCustomModelId(` ${first.toUpperCase()} `)).toEqual({
      providerId: 'custom-openai',
      customProviderId: 'PROVIDER ONE',
      modelId: 'SHARED/MODEL',
    })
    expect(normalizeModelId('  shared/model  ')).toBe('shared/model')
  })

  it('round-trips provider and model ids containing slashes', () => {
    const id = buildCustomModelId('custom-anthropic', 'provider/one', 'org/model')

    expect(parseCustomModelId(id)).toEqual({
      providerId: 'custom-anthropic',
      customProviderId: 'provider/one',
      modelId: 'org/model',
    })
  })
})
