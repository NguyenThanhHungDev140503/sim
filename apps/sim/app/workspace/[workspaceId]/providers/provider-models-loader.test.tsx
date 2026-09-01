/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface MockCustomProvidersState {
  data: { providers: unknown[] } | undefined
  error: Error | null
  isFetching: boolean
  isLoading: boolean
}

const mocks = vi.hoisted(() => ({
  pathname: '/workspace/workspace-1/tables',
  workspaceId: 'workspace-1' as string | undefined,
  searchOpen: false,
  useProviderModels: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
  })),
  customProvidersState: {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
  } as MockCustomProvidersState,
  useCustomProviders: vi.fn(),
  setProviderModels: vi.fn(),
  setProviderLoading: vi.fn(),
  setCustomProviderModels: vi.fn(),
  resetCustomProviderModels: vi.fn(),
  setOpenRouterModelInfo: vi.fn(),
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: mocks.workspaceId }),
  usePathname: () => mocks.pathname,
}))

vi.mock('@/hooks/queries/providers', () => ({
  useProviderModels: mocks.useProviderModels,
}))

vi.mock('@/hooks/queries/custom-providers', () => ({
  useCustomProviders: mocks.useCustomProviders,
}))

vi.mock('@/providers/utils', () => ({
  updateBasetenProviderModels: vi.fn(),
  updateFireworksProviderModels: vi.fn(),
  updateLiteLLMProviderModels: vi.fn(),
  updateOllamaCloudProviderModels: vi.fn(),
  updateOllamaProviderModels: vi.fn(),
  updateOpenRouterProviderModels: vi.fn(),
  updateTogetherProviderModels: vi.fn(),
  updateVLLMProviderModels: vi.fn(),
}))

vi.mock('@/stores/modals/search/store', () => ({
  useSearchModalStore: (selector: (state: { isOpen: boolean }) => unknown) =>
    selector({ isOpen: mocks.searchOpen }),
}))

vi.mock('@/stores/providers', () => ({
  useProvidersStore: (
    selector: (state: {
      setProviderModels: typeof mocks.setProviderModels
      setProviderLoading: typeof mocks.setProviderLoading
      setCustomProviderModels: typeof mocks.setCustomProviderModels
      resetCustomProviderModels: typeof mocks.resetCustomProviderModels
      setOpenRouterModelInfo: typeof mocks.setOpenRouterModelInfo
    }) => unknown
  ) =>
    selector({
      setProviderModels: mocks.setProviderModels,
      setProviderLoading: mocks.setProviderLoading,
      setCustomProviderModels: mocks.setCustomProviderModels,
      resetCustomProviderModels: mocks.resetCustomProviderModels,
      setOpenRouterModelInfo: mocks.setOpenRouterModelInfo,
    }),
}))

import { ProviderModelsLoader } from '@/app/workspace/[workspaceId]/providers/provider-models-loader'

let root: Root

function renderLoader() {
  act(() => {
    root.render(<ProviderModelsLoader />)
  })
}

function expectEveryProviderEnabled(enabled: boolean) {
  expect(mocks.useProviderModels).toHaveBeenCalledTimes(9)
  for (const call of mocks.useProviderModels.mock.calls) {
    expect(call[2]).toEqual({ enabled })
  }
}

function expectCustomProviderEnabled(enabled: boolean) {
  expect(mocks.useCustomProviders).toHaveBeenCalledWith('workspace-1', { enabled })
}

describe('ProviderModelsLoader request gating', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    root = createRoot(document.createElement('div'))
    mocks.pathname = '/workspace/workspace-1/tables'
    mocks.workspaceId = 'workspace-1'
    mocks.searchOpen = false
    mocks.customProvidersState = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
    }
    mocks.useCustomProviders.mockImplementation(() => mocks.customProvidersState)
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.clearAllMocks()
  })

  it.each(['tables', 'knowledge', 'files', 'logs', 'settings'])(
    'defers every provider catalog on the %s route',
    (route) => {
      mocks.pathname = `/workspace/workspace-1/${route}`
      renderLoader()

      expectEveryProviderEnabled(false)
      expectCustomProviderEnabled(false)
      expect(mocks.resetCustomProviderModels).toHaveBeenCalledWith('workspace-1')
    }
  )

  it.each(['home', 'w/workflow-1', 'chat/chat-1'])(
    'loads every provider catalog on the %s route',
    (route) => {
      mocks.pathname = `/workspace/workspace-1/${route}`
      renderLoader()

      expectEveryProviderEnabled(true)
      expectCustomProviderEnabled(true)
      expect(mocks.resetCustomProviderModels).toHaveBeenCalledWith('workspace-1')
    }
  )

  it('loads every provider catalog when global search opens on a resource route', () => {
    mocks.searchOpen = true
    renderLoader()

    expectEveryProviderEnabled(true)
    expectCustomProviderEnabled(true)
  })

  it('does not create an empty-workspace route prefix', () => {
    mocks.workspaceId = undefined
    mocks.searchOpen = true
    renderLoader()

    expectEveryProviderEnabled(false)
    expect(mocks.useCustomProviders).toHaveBeenCalledWith(undefined, { enabled: false })
  })

  it('resets custom models while loading', () => {
    mocks.pathname = '/workspace/workspace-1/home'
    mocks.customProvidersState = {
      data: undefined,
      isLoading: true,
      isFetching: false,
      error: null,
    }

    renderLoader()

    expect(mocks.resetCustomProviderModels).toHaveBeenCalledWith('workspace-1')
  })

  it('resets custom models when provider list is empty', () => {
    mocks.pathname = '/workspace/workspace-1/home'
    mocks.customProvidersState = {
      data: { providers: [] },
      isLoading: false,
      isFetching: false,
      error: null,
    }

    renderLoader()

    expect(mocks.resetCustomProviderModels).toHaveBeenCalledWith('workspace-1')
  })

  it('resets custom models on provider load error', () => {
    mocks.pathname = '/workspace/workspace-1/home'
    mocks.customProvidersState = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('load failed'),
    }

    renderLoader()

    expect(mocks.resetCustomProviderModels).toHaveBeenCalledWith('workspace-1')
  })

  it('keys custom model reset and loading data by workspace', () => {
    mocks.pathname = '/workspace/workspace-1/home'
    renderLoader()

    mocks.workspaceId = 'workspace-2'
    mocks.pathname = '/workspace/workspace-2/home'
    renderLoader()

    expect(mocks.resetCustomProviderModels).toHaveBeenLastCalledWith('workspace-2')
  })
})
