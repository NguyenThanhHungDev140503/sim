import type { ComponentType, SVGProps } from 'react'
import {
  AnthropicIcon,
  AzureIcon,
  BasetenIcon,
  BedrockIcon,
  CerebrasIcon,
  DeepseekIcon,
  FireworksIcon,
  GeminiIcon,
  GroqIcon,
  KimiIcon,
  LitellmIcon,
  MetaIcon,
  MistralIcon,
  NvidiaIcon,
  OllamaIcon,
  OpenAIIcon,
  OpenRouterIcon,
  SakanaIcon,
  TogetherIcon,
  VertexIcon,
  VllmIcon,
  xAIIcon,
  ZaiIcon,
} from '@/components/icons'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

export const PROVIDER_ICON_MAP: Record<string, IconComponent> = {
  anthropic: AnthropicIcon,
  'azure-openai': AzureIcon,
  'azure-anthropic': AzureIcon,
  baseten: BasetenIcon,
  bedrock: BedrockIcon,
  cerebras: CerebrasIcon,
  deepseek: DeepseekIcon,
  fireworks: FireworksIcon,
  google: GeminiIcon,
  vertex: VertexIcon,
  groq: GroqIcon,
  kimi: KimiIcon,
  litellm: LitellmIcon,
  meta: MetaIcon,
  mistral: MistralIcon,
  nvidia: NvidiaIcon,
  ollama: OllamaIcon,
  'ollama-cloud': OllamaIcon,
  openai: OpenAIIcon,
  openrouter: OpenRouterIcon,
  sakana: SakanaIcon,
  together: TogetherIcon,
  vllm: VllmIcon,
  xai: xAIIcon,
  zai: ZaiIcon,
}

export function getProviderIconComponent(providerId: string): IconComponent | null {
  return PROVIDER_ICON_MAP[providerId] ?? null
}
