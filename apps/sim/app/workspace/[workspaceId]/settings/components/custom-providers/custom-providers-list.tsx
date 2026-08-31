'use client'

import { Button, Checkbox, ChipInput, ChipTag } from '@sim/emcn'
import { Search } from '@sim/emcn/icons'
import { useMemo, useState } from 'react'
import type {
  CustomProvider,
  DiscoverCustomModelsResponse,
} from '@/lib/api/contracts/custom-providers'
import { SettingsEmptyState } from '@/app/workspace/[workspaceId]/settings/components/settings-empty-state'

interface CustomProvidersListProps {
  models?: DiscoverCustomModelsResponse['models']
  selectedModelIds?: Set<string>
  onSelectedModelIdsChange?: (modelIds: Set<string>) => void
  disabled?: boolean
  providers?: CustomProvider[]
  onEditProvider?: (provider: CustomProvider) => void
  onDeleteProvider?: (provider: CustomProvider) => void
}

export function CustomProvidersList({
  models = [],
  selectedModelIds = new Set(),
  onSelectedModelIdsChange = () => undefined,
  disabled = false,
  providers,
  onEditProvider,
  onDeleteProvider,
}: CustomProvidersListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const filteredModels = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return models
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query)
    )
  }, [models, searchTerm])

  if (providers) {
    if (providers.length === 0) {
      return <SettingsEmptyState variant='inline'>No custom providers saved.</SettingsEmptyState>
    }
    return (
      <div className='flex flex-col gap-2'>
        {providers.map((provider) => (
          <div key={provider.id} className='flex items-center justify-between rounded-md border border-[var(--border)] p-3'>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <span className='truncate text-sm'>{provider.name}</span>
                <ChipTag variant='gray'>{provider.protocol}</ChipTag>
              </div>
              <p className='truncate font-mono text-[var(--text-muted)] text-caption'>{provider.baseUrl}</p>
              <p className='text-[var(--text-secondary)] text-xs'>{provider.models.length} models</p>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <Button variant='ghost' onClick={() => onEditProvider?.(provider)} disabled={disabled}>Edit</Button>
              <Button variant='ghost' onClick={() => onDeleteProvider?.(provider)} disabled={disabled}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const allSelected = models.length > 0 && models.every((model) => selectedModelIds.has(model.id))

  const toggleModel = (modelId: string, checked: boolean) => {
    const next = new Set(selectedModelIds)
    if (checked) next.add(modelId)
    else next.delete(modelId)
    onSelectedModelIdsChange(next)
  }

  const toggleAll = (checked: boolean) => {
    onSelectedModelIdsChange(checked ? new Set(models.map((model) => model.id)) : new Set())
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center gap-2'>
        <ChipInput
          icon={Search}
          aria-label='Search discovered models'
          placeholder='Search models...'
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          disabled={disabled || models.length === 0}
          className='flex-1'
        />
        <ChipTag variant='gray'>{selectedModelIds.size} selected</ChipTag>
      </div>

      {models.length === 0 ? (
        <SettingsEmptyState variant='inline'>Load models to choose which ones to enable.</SettingsEmptyState>
      ) : filteredModels.length === 0 ? (
        <SettingsEmptyState variant='inline'>
          No models found matching "{searchTerm}"
        </SettingsEmptyState>
      ) : (
        <div className='flex max-h-[240px] flex-col gap-1 overflow-y-auto rounded-md border border-[var(--border)] p-2'>
          <label className='flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--surface-3)]'>
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => toggleAll(checked === true)}
              disabled={disabled}
              aria-label='Select all discovered models'
            />
            <span>Select All</span>
          </label>
          <div className='h-px bg-[var(--border)]' />
          {filteredModels.map((model) => (
            <label
              key={model.id}
              className='flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-[var(--surface-3)]'
            >
              <Checkbox
                checked={selectedModelIds.has(model.id)}
                onCheckedChange={(checked) => toggleModel(model.id, checked === true)}
                disabled={disabled}
                aria-label={`Select ${model.name}`}
                className='mt-0.5'
              />
              <span className='flex min-w-0 flex-col'>
                <span className='truncate text-sm'>{model.name}</span>
                <span className='truncate font-mono text-[var(--text-muted)] text-caption'>
                  {model.id}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
