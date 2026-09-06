import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const ROOT = resolve(import.meta.dirname, '..')
const SCRIPT = resolve(ROOT, 'scripts/generate-model-catalog.ts')
const catalogPath = resolve(ROOT, 'packages/deployment-config/model-catalog.json')

describe('model catalog artifact generator', () => {
  it('generates a clean, serializable catalog artifact without function or icon components', async () => {
    const raw = await readFile(catalogPath, 'utf8')
    const catalog = JSON.parse(raw)

    expect(catalog.providers).toBeDefined()
    expect(catalog.providers.length).toBeGreaterThan(0)

    for (const provider of catalog.providers) {
      expect(provider).not.toHaveProperty('icon')
      expect(typeof provider.name).toBe('string')
      expect(typeof provider.id).toBe('string')
      expect(typeof provider.description).toBe('string')
      expect(typeof provider.slug).toBe('string')
      expect(typeof provider.href).toBe('string')
      expect(Array.isArray(provider.models)).toBe(true)
      for (const model of provider.models) {
        expect(typeof model.id).toBe('string')
        expect(typeof model.displayName).toBe('string')
        expect(typeof model.pricing.input).toBe('number')
        expect(typeof model.pricing.output).toBe('number')
      }
    }

    expect(JSON.stringify(catalog)).not.toContain('function')
  })

  it('supports --check mode successfully when in sync', async () => {
    const { stdout } = await execFileAsync('bun', ['run', SCRIPT, '--check'], { cwd: ROOT })
    expect(stdout).toContain('Model catalog artifact is up to date')
  })

  it('keeps landing model utilities out of the provider registry graph', async () => {
    const source = await readFile(
      resolve(ROOT, 'apps/sim/app/(landing)/models/utils.ts'),
      'utf8'
    )

    expect(source).not.toContain("from '@/providers/models'")
  })
})
