export type ProviderName =
  | 'ollama'
  | 'ollama-cloud'
  | 'vllm'
  | 'litellm'
  | 'openrouter'
  | 'fireworks'
  | 'together'
  | 'baseten'
  | 'custom-openai'
  | 'custom-anthropic'
  | 'base'

export interface OpenRouterModelInfo {
  id: string
  contextLength?: number
  supportsStructuredOutputs?: boolean
  supportsTools?: boolean
  pricing?: {
    input: number
    output: number
  }
}

interface ProviderState {
  models: string[]
  isLoading: boolean
}

export interface CustomProviderModel {
  id: string
  label: string
  providerId: 'custom-openai' | 'custom-anthropic'
  customProviderId: string
  customProviderName: string
  endpoint: string
  hasApiKey: boolean
}

export interface ProvidersStore {
  providers: Record<ProviderName, ProviderState>
  customProviderModels: Record<string, CustomProviderModel>
  openRouterModelInfo: Record<string, OpenRouterModelInfo>
  setProviderModels: (provider: ProviderName, models: string[]) => void
  setCustomProviderModels: (models: CustomProviderModel[]) => void
  setProviderLoading: (provider: ProviderName, isLoading: boolean) => void
  setOpenRouterModelInfo: (modelInfo: Record<string, OpenRouterModelInfo>) => void
  getProvider: (provider: ProviderName) => ProviderState
  getCustomProviderModel: (modelId: string) => CustomProviderModel | undefined
  getOpenRouterModelInfo: (modelId: string) => OpenRouterModelInfo | undefined
}
