import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  discoverCustomModelsContract,
  createCustomProviderContract,
  deleteCustomProviderContract,
  listCustomProvidersContract,
  updateCustomProviderContract,
  type CreateCustomProviderInput,
  type ListCustomProvidersResponse,
  type UpdateCustomProviderInput,
  type DiscoverCustomModelsInput,
  type DiscoverCustomModelsResponse,
} from '@/lib/api/contracts/custom-providers'

export const CUSTOM_PROVIDERS_STALE_TIME = 60 * 1000
export const CUSTOM_PROVIDERS_QUERY_OPTIONS = {
  staleTime: CUSTOM_PROVIDERS_STALE_TIME,
} as const

export const customProvidersKeys = {
  all: ['custom-providers'] as const,
  discoveries: () => [...customProvidersKeys.all, 'discovery'] as const,
  lists: () => [...customProvidersKeys.all, 'list'] as const,
  list: (workspaceId?: string) => [...customProvidersKeys.lists(), workspaceId ?? ''] as const,
  details: () => [...customProvidersKeys.all, 'detail'] as const,
  detail: (id?: string) => [...customProvidersKeys.details(), id ?? ''] as const,
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

export function useCustomProviders(workspaceId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: customProvidersKeys.list(workspaceId),
    queryFn: ({ signal }): Promise<ListCustomProvidersResponse> =>
      requestJson(listCustomProvidersContract, { query: { workspaceId: workspaceId as string }, signal }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    ...CUSTOM_PROVIDERS_QUERY_OPTIONS,
  })
}

export function useCreateCustomProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCustomProviderInput) =>
      requestJson(createCustomProviderContract, { body }),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: customProvidersKeys.list(variables.workspaceId) })
    },
  })
}

export function useUpdateCustomProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCustomProviderInput) =>
      requestJson(updateCustomProviderContract, { params: { id }, body }),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: customProvidersKeys.list(variables.workspaceId) })
      void queryClient.invalidateQueries({ queryKey: customProvidersKeys.detail(variables.id) })
    },
  })
}

export function useDeleteCustomProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) =>
      requestJson(deleteCustomProviderContract, { params: { id }, body: { workspaceId } }),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: customProvidersKeys.list(variables.workspaceId) })
      void queryClient.removeQueries({ queryKey: customProvidersKeys.detail(variables.id) })
    },
  })
}
