# Custom OpenAI & Anthropic-Compatible Endpoints & Model Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to configure custom OpenAI-compatible and Anthropic-compatible endpoints with dynamic model discovery ("Load Models"), multi-select checkboxes ("Select All"), and seamless usage both at the Workspace Settings level and Per-Block Canvas override.

**Architecture:** A lightweight discovery route (`POST /api/providers/custom/discover`) securely queries `/v1/models` on external or local servers (with SSRF protection). Discovered models are selectable via a checklist and persisted to the Workspace's BYOK/custom providers. At execution time, the custom provider executor routes LLM requests (with streaming and function-calling loops) to the resolved Base URL and API Key.

**Tech Stack:** Next.js (App Router), TypeScript, Zod, TanStack React Query, Zustand, OpenAI SDK, Drizzle ORM, Vitest.

## Global Constraints
- `bun run check:api-validation` must pass with zero violations.
- API route handlers must run inside `withRouteHandler` or shared route builders.
- No direct `zod` imports in route handlers or client hooks (use contracts in `@/lib/api/contracts/**`).
- Always use `createLogger` from `@sim/logger`.
- IDs must be generated using `generateId()` or `generateShortId()` from `@sim/utils/id`.

---

### Task 1: API Contract & Discovery Route (`POST /api/providers/custom/discover`)

**Files:**
- Create: `apps/sim/lib/api/contracts/custom-providers.ts`
- Modify: `apps/sim/lib/api/contracts/index.ts`
- Create: `apps/sim/app/api/providers/custom/discover/route.ts`
- Create: `apps/sim/app/api/providers/custom/discover/route.test.ts`

**Interfaces:**
- Produces:
  - Contract: `discoverCustomModelsContract`
  - Types: `DiscoverCustomModelsInput`, `DiscoverCustomModelsResponse`
  - Endpoint: `POST /api/providers/custom/discover`

- [ ] **Step 1: Write the failing contract test & route test**

```typescript
// apps/sim/app/api/providers/custom/discover/route.test.ts
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

describe('POST /api/providers/custom/discover', () => {
  it('discovers models from an OpenAI-compatible endpoint', async () => {
    const req = new NextRequest('http://localhost:3000/api/providers/custom/discover', {
      method: 'POST',
      body: JSON.stringify({
        baseUrl: 'https://api.together.xyz/v1',
        apiKey: 'test-key',
        protocol: 'openai',
      }),
    })
    const res = await POST(req, {} as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.models)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/sim/app/api/providers/custom/discover/route.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the contract and discovery route**

In `apps/sim/lib/api/contracts/custom-providers.ts`:
```typescript
import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts'

export const discoverCustomModelsBodySchema = z.object({
  baseUrl: z.string().min(1, 'Base URL is required'),
  apiKey: z.string().optional(),
  protocol: z.enum(['openai', 'anthropic']).default('openai'),
})

export const customModelItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
})

export const discoverCustomModelsResponseSchema = z.object({
  success: z.boolean(),
  models: z.array(customModelItemSchema),
})

export type DiscoverCustomModelsInput = z.input<typeof discoverCustomModelsBodySchema>
export type DiscoverCustomModelsResponse = z.output<typeof discoverCustomModelsResponseSchema>

export const discoverCustomModelsContract = defineRouteContract({
  method: 'POST',
  path: '/api/providers/custom/discover',
  body: discoverCustomModelsBodySchema,
  response: {
    mode: 'json',
    schema: discoverCustomModelsResponseSchema,
  },
})
```

In `apps/sim/app/api/providers/custom/discover/route.ts`:
```typescript
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { discoverCustomModelsContract } from '@/lib/api/contracts/custom-providers'
import { parseRequest } from '@/lib/api/server'
import { createPinnedFetch, validateUrlWithDNS } from '@/lib/core/security/input-validation.server'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getOpenAICompatibleApiBaseUrl } from '@/providers/openai-compat/base-url'

const logger = createLogger('DiscoverCustomModelsAPI')

export const POST = withRouteHandler(async (request: NextRequest, context: any) => {
  const parsed = await parseRequest(discoverCustomModelsContract, request, context)
  if (!parsed.success) return parsed.response

  const { baseUrl, apiKey, protocol } = parsed.data.body

  try {
    const validation = await validateUrlWithDNS(baseUrl, 'Custom LLM endpoint', { allowHttp: true })
    if (!validation.isValid) {
      return NextResponse.json({ success: false, error: validation.error, models: [] }, { status: 400 })
    }

    const pinnedFetch = validation.resolvedIP ? createPinnedFetch(validation.resolvedIP) : fetch
    let url: string
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (protocol === 'anthropic') {
      url = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl.replace(/\/+$/, '')}/v1/models`
      if (apiKey) {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
      }
    } else {
      const apiBaseUrl = getOpenAICompatibleApiBaseUrl(baseUrl)
      url = `${apiBaseUrl}/models`
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`
      }
    }

    const response = await pinnedFetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      logger.warn('Failed to discover custom models', { status: response.status, errorText })
      return NextResponse.json({ success: false, error: `Upstream error (${response.status}): ${errorText}`, models: [] }, { status: response.status })
    }

    const data = (await response.json()) as any
    const rawList = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []
    const models = rawList
      .map((item: any) => {
        const id = typeof item === 'string' ? item : item.id
        const name = typeof item === 'object' && item.display_name ? item.display_name : id
        return id ? { id, name } : null
      })
      .filter(Boolean)

    return NextResponse.json({ success: true, models })
  } catch (error) {
    logger.error('Error discovering custom models:', error)
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'Failed to fetch models'), models: [] }, { status: 500 })
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/sim/app/api/providers/custom/discover/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/sim/lib/api/contracts/custom-providers.ts apps/sim/lib/api/contracts/index.ts apps/sim/app/api/providers/custom/discover/
git commit -m "feat(providers): add custom model discovery endpoint and contract"
```

---

### Task 2: Custom Provider Execution Engine (`custom-openai` & `custom-anthropic`)

**Files:**
- Create: `apps/sim/providers/custom-openai/index.ts`
- Create: `apps/sim/providers/custom-openai/index.test.ts`
- Modify: `apps/sim/providers/registry.ts`
- Modify: `apps/sim/providers/types.ts`
- Modify: `apps/sim/providers/utils.ts`
- Modify: `apps/sim/providers/models.ts`

**Interfaces:**
- Produces:
  - `customOpenAIProvider`: ProviderConfig supporting dynamic endpoint Base URL & API Key, with OpenAI streaming & function-calling loop.
  - Dynamic registration in `getProviderExecutor('custom-openai')`.

- [ ] **Step 1: Write failing test for custom OpenAI provider execution**

```typescript
// apps/sim/providers/custom-openai/index.test.ts
import { describe, expect, it } from 'vitest'
import { customOpenAIProvider } from './index'

describe('customOpenAIProvider', () => {
  it('has correct id and handles custom requests', () => {
    expect(customOpenAIProvider.id).toBe('custom-openai')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/sim/providers/custom-openai/index.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement custom OpenAI provider**

In `apps/sim/providers/custom-openai/index.ts`:
Reuse the robust streaming tool loop and OpenAI client logic from `apps/sim/providers/vllm/index.ts` and `apps/sim/providers/openai-compat/`, accepting `request.customEndpoint || request.azureEndpoint || env.CUSTOM_OPENAI_BASE_URL`.

- [ ] **Step 4: Register provider in `registry.ts`, `types.ts`, `models.ts`, `utils.ts`**

Add `'custom-openai'` and `'custom-anthropic'` to `ProviderId`, `providerRegistry`, and `PROVIDER_DEFINITIONS`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test apps/sim/providers/custom-openai/index.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/sim/providers/custom-openai/ apps/sim/providers/registry.ts apps/sim/providers/types.ts apps/sim/providers/utils.ts apps/sim/providers/models.ts
git commit -m "feat(providers): implement custom-openai execution engine and registration"
```

---

### Task 3: Workspace Settings UI with Checkboxes & "Select All"

**Files:**
- Create: `apps/sim/hooks/queries/custom-providers.ts`
- Create: `apps/sim/app/workspace/[workspaceId]/settings/components/custom-providers/custom-provider-dialog.tsx`
- Create: `apps/sim/app/workspace/[workspaceId]/settings/components/custom-providers/custom-providers-list.tsx`
- Modify: `apps/sim/app/workspace/[workspaceId]/settings/components/byok/byok.tsx`

**Interfaces:**
- Produces:
  - React Query mutation `useDiscoverCustomModels()` calling `requestJson(discoverCustomModelsContract, ...)`
  - UI Dialog for adding/editing Custom Provider with:
    - Base URL input
    - API Key input
    - Protocol selector
    - `[ 🔄 Load Models ]` button
    - Checkbox list of discovered models with `[ ] Select All` toggle
    - Search filter for discovered models
    - `[+ Add Custom Model]` manual input
    - `[ Save Provider ]` button

- [ ] **Step 1: Write hook using contract**

In `apps/sim/hooks/queries/custom-providers.ts`:
```typescript
import { useMutation } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  discoverCustomModelsContract,
  type DiscoverCustomModelsInput,
  type DiscoverCustomModelsResponse,
} from '@/lib/api/contracts/custom-providers'

export function useDiscoverCustomModels() {
  return useMutation({
    mutationFn: async (input: DiscoverCustomModelsInput): Promise<DiscoverCustomModelsResponse> => {
      return requestJson(discoverCustomModelsContract, {
        body: input,
      })
    },
  })
}
```

- [ ] **Step 2: Implement the Custom Provider Dialog with Checkboxes & Select All**

Implement `custom-provider-dialog.tsx` with state:
```typescript
const [discoveredModels, setDiscoveredModels] = useState<Array<{ id: string; name: string }>>([])
const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())

// Select All Handler
const handleSelectAll = (checked: boolean) => {
  if (checked) {
    setSelectedModelIds(new Set(discoveredModels.map(m => m.id)))
  } else {
    setSelectedModelIds(new Set())
  }
}
```

- [ ] **Step 3: Integrate into Workspace Settings (`byok.tsx`)**

Add a dedicated section for "Custom AI Endpoints (OpenAI / Anthropic Compatible)" with a button "+ Add Custom Provider".

- [ ] **Step 4: Commit**

```bash
git add apps/sim/hooks/queries/custom-providers.ts apps/sim/app/workspace/[workspaceId]/settings/components/custom-providers/ apps/sim/app/workspace/[workspaceId]/settings/components/byok/byok.tsx
git commit -m "feat(settings): add custom provider management with model discovery and multi-select"
```

---

### Task 4: Dynamic Workspace Model Loader & Dropdown Sync

**Files:**
- Modify: `apps/sim/app/workspace/[workspaceId]/providers/provider-models-loader.tsx`
- Modify: `apps/sim/stores/providers/store.ts`
- Modify: `apps/sim/blocks/utils.ts`

**Interfaces:**
- Synchronizes saved custom provider models into `useProvidersStore` and `PROVIDER_DEFINITIONS`.
- `getModelOptions()` includes all custom models with appropriate custom provider icons/labels.

- [ ] **Step 1: Update `provider-models-loader.tsx`**

Ensure `useSyncProvider('custom', shouldLoad, workspaceId)` fetches active custom models and calls `updateCustomProviderModels(...)`.

- [ ] **Step 2: Update `getModelOptions()` in `blocks/utils.ts`**

Format custom models as `custom/<provider-name>/<model-id>` or include them with proper labels so they appear in dropdowns.

- [ ] **Step 3: Commit**

```bash
git add apps/sim/app/workspace/[workspaceId]/providers/provider-models-loader.tsx apps/sim/stores/providers/store.ts apps/sim/blocks/utils.ts
git commit -m "feat(workspace): sync custom provider models into canvas dropdowns"
```

---

### Task 5: Per-Block Canvas Support (AgentBlock & LLM Blocks)

**Files:**
- Modify: `apps/sim/blocks/utils.ts`
- Modify: `apps/sim/blocks/blocks/agent.ts`
- Modify: `apps/sim/executor/handlers/agent/agent-handler.ts`

**Interfaces:**
- Subblocks: `customEndpoint` & `apiKey` visible when custom provider/model is chosen or custom override is enabled.
- Handler: `agent-handler.ts` forwards `customEndpoint` in `providerRequest`.

- [ ] **Step 1: Add `customEndpoint` to `getProviderCredentialSubBlocks` in `blocks/utils.ts`**

```typescript
{
  id: 'customEndpoint',
  title: 'API Base URL',
  type: 'short-input',
  placeholder: 'https://api.your-llm.com/v1 or http://localhost:8000/v1',
  condition: (values?: Record<string, unknown>) => {
    const model = typeof values?.model === 'string' ? values.model : ''
    return {
      field: 'model',
      value: model.startsWith('custom/') || model.startsWith('openai-compat/'),
    }
  },
}
```

- [ ] **Step 2: Update `agent-handler.ts`**

Include `customEndpoint: inputs.customEndpoint` in the provider request parameters.

- [ ] **Step 3: Commit**

```bash
git add apps/sim/blocks/utils.ts apps/sim/blocks/blocks/agent.ts apps/sim/executor/handlers/agent/agent-handler.ts
git commit -m "feat(canvas): add custom endpoint override subblock to agent block"
```

---

### Task 6: Verification, Linting & End-to-End Tests

**Files:**
- Run: `bun run check:api-validation`
- Run: `bun test`

- [ ] **Step 1: Run API validation gate**

Run: `bun run check:api-validation`
Expected: PASS with 0 boundary violations.

- [ ] **Step 2: Run all provider and route unit tests**

Run: `bun test apps/sim/app/api/providers/custom/ apps/sim/providers/custom-openai/`
Expected: PASS

- [ ] **Step 3: Final commit**

```bash
git commit -m "chore: verify API validation and test suite for custom providers"
```
