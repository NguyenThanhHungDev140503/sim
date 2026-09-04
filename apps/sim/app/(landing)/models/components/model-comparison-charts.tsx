import Link from 'next/link'
import { getProviderColor } from '@/app/(landing)/models/components/constants'
import { getProviderIconComponent } from '@/app/(landing)/models/components/provider-icons'
import type { CatalogModel } from '@/app/(landing)/models/utils'
import {
  formatPrice,
  formatTokenCount,
} from '@/app/(landing)/models/utils'

/** Flagship providers featured in the landing-page comparison, in display order. */
const FEATURED_COMPARISON_PROVIDER_IDS = ['anthropic', 'openai', 'google']

/** Max latest models pulled from each featured provider. */
const MAX_MODELS_PER_PROVIDER = 4

function selectComparisonModels(models: CatalogModel[]): CatalogModel[] {
  const seen = new Set<string>()
  const result: CatalogModel[] = []

  for (const providerId of FEATURED_COMPARISON_PROVIDER_IDS) {
    const providerModels = models
      .filter((model) => model.providerId === providerId && !model.deprecated)
      .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))

    let takenForProvider = 0
    for (const model of providerModels) {
      if (takenForProvider >= MAX_MODELS_PER_PROVIDER) break

      const nameKey = model.displayName.toLowerCase()
      if (seen.has(nameKey)) continue

      seen.add(nameKey)
      result.push(model)
      takenForProvider += 1
    }
  }

  return result
}

interface ModelLabelProps {
  model: CatalogModel
}

function ModelLabel({ model }: ModelLabelProps) {
  const Icon = getProviderIconComponent(model.providerId)

  return (
    <div className='flex w-[90px] shrink-0 items-center justify-end gap-1.5 sm:w-[140px] lg:w-[180px]'>
      {Icon && <Icon className='size-3.5 shrink-0' />}
      <span className='truncate text-[13px] text-[var(--text-primary)] leading-none tracking-[-0.01em]'>
        {model.displayName}
      </span>
    </div>
  )
}

interface ChartProps {
  models: CatalogModel[]
}

function StackedCostChart({ models }: ChartProps) {
  const entries = models
    .reduce<Array<{ model: CatalogModel; input: number; output: number; total: number }>>(
      (acc, model) => {
        const total = model.pricing.input + model.pricing.output
        if (total > 0) {
          acc.push({ model, input: model.pricing.input, output: model.pricing.output, total })
        }
        return acc
      },
      []
    )
    .sort((a, b) => a.total - b.total)

  if (entries.length === 0) return null

  const maxTotal = Math.max(...entries.map((e) => e.total))

  return (
    <div className='space-y-3.5'>
      {entries.map(({ model, input, output, total }) => {
        const inputWidth = (input / maxTotal) * 100
        const outputWidth = (output / maxTotal) * 100
        const color = getProviderColor(model.providerId)

        return (
          <div key={model.id} className='group flex items-center gap-3'>
            <ModelLabel model={model} />

            <div className='relative flex h-7 flex-1 items-center overflow-hidden rounded-[6px] bg-[var(--surface-2)]'>
              <div
                className='h-full transition-all duration-300'
                style={{
                  width: `${inputWidth}%`,
                  backgroundColor: color,
                  opacity: 0.85,
                }}
                title={`Input: ${formatPrice(input)}/1M`}
              />
              <div
                className='h-full transition-all duration-300'
                style={{
                  width: `${outputWidth}%`,
                  backgroundColor: color,
                  opacity: 0.45,
                }}
                title={`Output: ${formatPrice(output)}/1M`}
              />

              <span className='absolute right-2.5 text-[12px] font-medium text-[var(--text-secondary)]'>
                {formatPrice(total)}
                <span className='hidden text-[11px] text-[var(--text-muted)] sm:inline'>/1M</span>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ContextWindowChart({ models }: ChartProps) {
  const entries = models
    .map((model) => ({ model, value: model.contextWindow }))
    .filter((e): e is { model: CatalogModel; value: number } => e.value !== null && e.value > 0)
    .sort((a, b) => b.value - a.value)

  if (entries.length === 0) return null

  const maxValue = Math.max(...entries.map((e) => e.value))

  return (
    <div className='space-y-3.5'>
      {entries.map(({ model, value }) => {
        const width = (value / maxValue) * 100
        const color = getProviderColor(model.providerId)

        return (
          <div key={model.id} className='group flex items-center gap-3'>
            <ModelLabel model={model} />

            <div className='relative flex h-7 flex-1 items-center overflow-hidden rounded-[6px] bg-[var(--surface-2)]'>
              <div
                className='h-full transition-all duration-300'
                style={{
                  width: `${Math.max(width, 2)}%`,
                  backgroundColor: color,
                  opacity: 0.75,
                }}
              />

              <span className='absolute right-2.5 text-[12px] font-medium text-[var(--text-secondary)]'>
                {formatTokenCount(value)}
                <span className='hidden text-[11px] text-[var(--text-muted)] sm:inline'>
                  {' '}
                  tokens
                </span>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ModelComparisonCharts({ models }: ChartProps) {
  const comparisonModels = selectComparisonModels(models)

  if (comparisonModels.length === 0) return null

  return (
    <section aria-labelledby='comparison-heading' className='mt-16 space-y-12'>
      <div className='space-y-2'>
        <h2
          id='comparison-heading'
          className='text-[20px] font-medium text-[var(--text-primary)] tracking-[-0.01em]'
        >
          Model Comparison
        </h2>
        <p className='text-[14px] text-[var(--text-secondary)]'>
          Compare pricing and context windows across latest flagship models from Anthropic, OpenAI,
          and Google.
        </p>
      </div>

      <div className='grid gap-8 lg:grid-cols-2'>
        <div className='space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6'>
          <div className='space-y-1'>
            <h3 className='text-[15px] font-medium text-[var(--text-primary)]'>Cost per 1M Tokens</h3>
            <p className='text-[12px] text-[var(--text-muted)]'>
              Combined input (solid) and output (light) pricing
            </p>
          </div>
          <StackedCostChart models={comparisonModels} />
          <div className='flex items-center gap-4 pt-2 text-[11px] text-[var(--text-muted)]'>
            <span className='flex items-center gap-1.5'>
              <span className='size-2.5 rounded-sm bg-[var(--text-secondary)] opacity-85' />
              Input
            </span>
            <span className='flex items-center gap-1.5'>
              <span className='size-2.5 rounded-sm bg-[var(--text-secondary)] opacity-45' />
              Output
            </span>
          </div>
        </div>

        <div className='space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6'>
          <div className='space-y-1'>
            <h3 className='text-[15px] font-medium text-[var(--text-primary)]'>Context Window</h3>
            <p className='text-[12px] text-[var(--text-muted)]'>
              Total tokens supported per request
            </p>
          </div>
          <ContextWindowChart models={comparisonModels} />
        </div>
      </div>

      <div className='flex justify-end'>
        <Link
          href='/comparisons'
          className='text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        >
          View detailed head-to-head comparisons →
        </Link>
      </div>
    </section>
  )
}
