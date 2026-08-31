import { useMutation } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  discoverCustomModelsContract,
  type DiscoverCustomModelsInput,
  type DiscoverCustomModelsResponse,
} from '@/lib/api/contracts/custom-providers'

export const customProvidersKeys = {
  all: ['custom-providers'] as const,
  discoveries: () => [...customProvidersKeys.all, 'discovery'] as const,
}

export function useDiscoverCustomModels() {
  return useMutation({
    mutationFn: async (
      input: DiscoverCustomModelsInput
    ): Promise<DiscoverCustomModelsResponse> =>
      requestJson(discoverCustomModelsContract, {
        body: input,
      }),
  })
}
