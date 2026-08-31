'use client'

import { useState } from 'react'
import {
  Button,
  ChipInput,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  ChipSelect,
} from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import type {
  CustomProvider,
  DiscoverCustomModelsInput,
  DiscoverCustomModelsResponse,
} from '@/lib/api/contracts/custom-providers'
import { useDiscoverCustomModels } from '@/hooks/queries/custom-providers'
import { CustomProvidersList } from '@/app/workspace/[workspaceId]/settings/components/custom-providers/custom-providers-list'

interface CustomProviderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider?: CustomProvider
  canSaveProvider: boolean
  isSaving?: boolean
  onSaveProvider: (input: DiscoverCustomModelsInput & { name: string; models: string[]; id?: string }) => Promise<void>
}

const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI-Compatible' },
  { value: 'anthropic', label: 'Anthropic-Compatible' },
]

export function CustomProviderDialog({
  open,
  onOpenChange,
  provider,
  canSaveProvider,
  isSaving = false,
  onSaveProvider,
}: CustomProviderDialogProps) {
  const [name, setName] = useState(provider?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [protocol, setProtocol] = useState<DiscoverCustomModelsInput['protocol']>(provider?.protocol ?? 'openai')
  const [manualModel, setManualModel] = useState('')
  const [models, setModels] = useState<DiscoverCustomModelsResponse['models']>(
    provider?.models.map((id) => ({ id, name: id })) ?? []
  )
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    new Set(provider?.models ?? [])
  )
  const [error, setError] = useState<string | null>(null)
  const discoverModels = useDiscoverCustomModels()

  const close = () => {
    if (discoverModels.isPending || isSaving) return
    onOpenChange(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    close()
  }

  const handleLoadModels = async () => {
    setError(null)
    try {
      const result = await discoverModels.mutateAsync({ baseUrl, apiKey, protocol })
      setModels(result.models)
      setSelectedModelIds(new Set(result.models.map((model) => model.id)))
      if (!result.success) setError(result.error ?? 'Failed to load models')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load models'))
    }
  }

  const handleAddManualModel = () => {
    const id = manualModel.trim()
    if (!id || models.some((model) => model.id === id)) return
    setModels((current) => [...current, { id, name: id }])
    setSelectedModelIds((current) => new Set(current).add(id))
    setManualModel('')
  }

  const handleSave = async () => {
    if (!canSaveProvider || selectedModelIds.size === 0 || !name.trim()) return
    setError(null)
    try {
      await onSaveProvider({ id: provider?.id, name: name.trim(), baseUrl, apiKey: apiKey || undefined, protocol, models: [...selectedModelIds] })
      close()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save custom provider'))
    }
  }

  return (
    <ChipModal open={open} onOpenChange={handleOpenChange} srTitle={provider ? 'Edit Custom Provider' : 'Add Custom Provider'}>
      <ChipModalHeader onClose={close}>{provider ? 'Edit Custom Provider' : 'Add Custom Provider'}</ChipModalHeader>
      <ChipModalBody>
        <ChipModalField type='input' title='Provider name' value={name} onChange={setName} required disabled={isSaving}
          placeholder='My OpenAI endpoint' />
        <ChipModalField type='input' title='Base URL' value={baseUrl} onChange={setBaseUrl} required disabled={isSaving}
          placeholder='https://api.example.com/v1' />
        <ChipModalField type='custom' title='API Key' disabled={isSaving}>
          <ChipInput
            type='password'
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder='Optional API key'
            autoComplete='off'
            disabled={isSaving}
          />
        </ChipModalField>
        <ChipModalField type='custom' title='Protocol' required disabled={isSaving}>
          <ChipSelect
            options={PROTOCOL_OPTIONS}
            value={protocol}
            onChange={(value) => setProtocol(value as DiscoverCustomModelsInput['protocol'])}
            placeholder='Select protocol'
            fullWidth
            dropdownWidth='trigger'
            disabled={isSaving}
          />
        </ChipModalField>
        <ChipModalField type='custom' title='Models'>
          <div className='flex flex-col gap-3'>
            <Button
              variant='secondary'
              onClick={handleLoadModels}
              disabled={!baseUrl.trim() || discoverModels.isPending || isSaving}
            >
              {discoverModels.isPending ? 'Loading Models...' : 'Load Models'}
            </Button>
            <CustomProvidersList
              models={models}
              selectedModelIds={selectedModelIds}
              onSelectedModelIdsChange={setSelectedModelIds}
              disabled={discoverModels.isPending || isSaving}
            />
            <div className='flex gap-2'>
              <ChipInput
                value={manualModel}
                onChange={(event) => setManualModel(event.target.value)}
                placeholder='Add model ID manually'
                className='flex-1'
                disabled={discoverModels.isPending || isSaving}
              />
              <Button
                variant='secondary'
                onClick={handleAddManualModel}
                disabled={!manualModel.trim() || discoverModels.isPending || isSaving}
              >
                + Add Custom Model
              </Button>
            </div>
          </div>
        </ChipModalField>
        <ChipModalError>{error}</ChipModalError>
      </ChipModalBody>
      <ChipModalFooter
        onCancel={close}
        cancelDisabled={discoverModels.isPending || isSaving}
        primaryAction={{
          label: provider ? 'Update Provider' : 'Save Provider',
          onClick: handleSave,
          disabled:
            !canSaveProvider ||
            !name.trim() ||
            !baseUrl.trim() ||
            selectedModelIds.size === 0 ||
            discoverModels.isPending ||
            isSaving,
        }}
      />
    </ChipModal>
  )
}
