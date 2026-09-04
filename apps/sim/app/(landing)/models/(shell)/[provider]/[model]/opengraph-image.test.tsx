/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import Image from './opengraph-image'

describe('model Open Graph image', () => {
  it('renders a valid PNG response for an existing model', async () => {
    const response = await Image({
      params: Promise.resolve({ provider: 'openai', model: 'gpt-4-1' }),
    })

    expect(response).toBeDefined()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/png')
  })
})
