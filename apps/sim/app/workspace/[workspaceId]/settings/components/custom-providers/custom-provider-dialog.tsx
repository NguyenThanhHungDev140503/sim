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
  DiscoverCustomModelsInput,
  DiscoverCustomModelsResponse,
} from '@/lib/api/contracts/custom-providers'
import { useDiscoverCustomModels } from '@/hooks/queries/custom-providers'
import { CustomProvidersList } from '@/app/workspace/[workspaceId]/settings/components/custom-providers/custom-providers-list'

interface CustomProviderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canSaveProvider?: boolean
  saveDisabledReason?: string
  onSaveProvider?: (input: DiscoverCustomModelsInput & { models: string[] }) => Promise<void>
}

const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI-Compatible' },
  { value: 'anthropic', label: 'Anthropic-Compatible' },
]

export function CustomProviderDialog({
  open,
  onOpenChange,
  canSaveProvider = false,
  saveDisabledReason = 'Custom provider persistence is not available.',
  onSaveProvider,
}: CustomProviderDialogProps) {
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [protocol, setProtocol] = useState<DiscoverCustomModelsInput['protocol']>('openai')
  const [manualModel, setManualModel] = useState('')
  const [models, setModels] = useState<DiscoverCustomModelsResponse['models']>([])
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const discoverModels = useDiscoverCustomModels()

  const close = () => {
    if (discoverModels.isPending) return
    onOpenChange(false)
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
    if (!onSaveProvider || !canSaveProvider || selectedModelIds.size === 0) return
    setError(null)
    try {
      await onSaveProvider({ baseUrl, apiKey, protocol, models: [...selectedModelIds] })
      close()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save custom provider'))
    }
  }

  return (
    <ChipModal open={open} onOpenChange={onOpenChange} srTitle='Add Custom Provider'>
      <ChipModalHeader onClose={close}>Add Custom Provider</ChipModalHeader>
      <ChipModalBody>
        <ChipModalField type='input' title='Base URL' value={baseUrl} onChange={setBaseUrl} required
          placeholder='https://api.example.com/v1' />
        <ChipModalField type='custom' title='API Key'>
          <ChipInput
            type='password'
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder='Optional API key'
            autoComplete='off'
          />
        </ChipModalField>
        <ChipModalField type='custom' title='Protocol' required>
          <ChipSelect
            options={PROTOCOL_OPTIONS}
            value={protocol}
            onChange={(value) => setProtocol(value as DiscoverCustomModelsInput['protocol'])}
            placeholder='Select protocol'
            fullWidth
            dropdownWidth='trigger'
          />
        </ChipModalField>
        <ChipModalField type='custom' title='Models'>
          <div className='flex flex-col gap-3'>
            <Button
              variant='secondary'
              onClick={handleLoadModels}
              disabled={!baseUrl.trim() || discoverModels.isPending}
            >
              {discoverModels.isPending ? 'Loading Models...' : 'Load Models'}
            </Button>
            <CustomProvidersList
              models={models}
              selectedModelIds={selectedModelIds}
              onSelectedModelIdsChange={setSelectedModelIds}
              disabled={discoverModels.isPending}
            />
            <div className='flex gap-2'>
              <ChipInput
                value={manualModel}
                onChange={(event) => setManualModel(event.target.value)}
                placeholder='Add model ID manually'
                className='flex-1'
                disabled={discoverModels.isPending}
              />
              <Button
                variant='secondary'
                onClick={handleAddManualModel}
                disabled={!manualModel.trim() || discoverModels.isPending}
              >
                Add Custom Model
              </Button>
            </div>
          </div>
        </ChipModalField>
        {!canSaveProvider && <ChipModalError>{saveDisabledReason}</ChipModalError>}
        <ChipModalError>{error}</ChipModalError>
      </ChipModalBody>
      <ChipModalFooter
        onCancel={close}
        cancelDisabled={discoverModels.isPending}
        primaryAction={{
          label: 'Save Provider',
          onClick: handleSave,
          disabled:
            !canSaveProvider ||
            !baseUrl.trim() ||
            selectedModelIds.size === 0 ||
            discoverModels.isPending,
        }}
      />
    </ChipModal>
  )
}
