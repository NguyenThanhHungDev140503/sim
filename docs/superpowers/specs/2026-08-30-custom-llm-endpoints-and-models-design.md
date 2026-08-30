# Custom OpenAI & Anthropic-Compatible Endpoints & Model Discovery

## Overview
This design specifies the implementation of **Custom LLM Providers (OpenAI-compatible & Anthropic-compatible)** in Sim. It enables users to configure custom self-hosted or proxy endpoints (e.g. vLLM, LM Studio, Ollama, DeepSeek, Together AI, LiteLLM, or private corporate proxies) with dynamic model discovery ("Load Models") and model selection via checkboxes, supported both at the **Workspace Settings** level and the **Per-Block Canvas** level.

---

## Key Requirements & Capabilities

1. **Protocol Support**:
   - **OpenAI-Compatible** (`GET /v1/models`, `/v1/chat/completions`)
   - **Anthropic-Compatible** (`GET /v1/models`, `/v1/messages`)
2. **Dynamic Model Discovery ("Load Models")**:
   - User inputs Base URL (e.g., `http://localhost:8000/v1` or `https://api.together.xyz/v1`) and optional API Key.
   - User triggers `[ Load Models ]`.
   - Backend calls `${baseUrl}/models` (or `/v1/models`) securely using Sim's SSRF-safe pinned fetch (`validateUrlWithDNS` + `createPinnedFetch`).
   - UI displays discovered models with individual checkboxes and a `[ ] Select All` toggle.
   - Fallback button `[+ Add Custom Model]` allows manual model ID entry if the endpoint does not support listing models.
3. **Hybrid Availability**:
   - **Workspace Level**: Stored in Workspace settings, auto-populates model selector across all blocks and workflows in the workspace under a dedicated custom provider category.
   - **Per-Block Level**: Override capability in Agent/LLM blocks allowing custom Base URL and Model ID directly without workspace-wide saving.
4. **Execution & Capabilities**:
   - Full support for Streaming (`agent-events-v1`), Tool Calling (Function Calling loop), Structured Outputs (JSON Schema), and Multi-turn history.
   - Encrypted storage of API keys using Sim's standard `encryptSecret` / `decryptSecret`.

---

## Architecture & System Components

### 1. Discovery API Contract & Endpoint
- **Contract**: `apps/sim/lib/api/contracts/providers.ts`
  - `discoverCustomModelsContract`:
    - Request Body: `{ baseUrl: string, apiKey?: string, protocol?: 'openai' | 'anthropic' }`
    - Response: `{ success: true, models: Array<{ id: string, name: string, object?: string }> }`
- **Route**: `apps/sim/app/api/providers/custom/discover/route.ts`
  - Validates URL against SSRF protection with `allowHttp: true` for local/intranet endpoints.
  - Normalizes Base URL using `getOpenAICompatibleApiBaseUrl`.
  - Executes GET request with corresponding headers (`Authorization: Bearer <key>` or `x-api-key: <key>`).
  - Returns sanitized model list.

### 2. Workspace Storage & BYOK Extension
- **Schema & Storage**:
  - Leverages `workspace_byok_keys` / custom provider records.
  - Stores provider identifier (e.g., `custom-openai` or `custom-anthropic`), encrypted API Key, Base URL, display label, and selected model array (e.g., `['deepseek-chat', 'llama-3.3-70b']`).
- **Workspace Providers Loader**:
  - `apps/sim/app/workspace/[workspaceId]/providers/provider-models-loader.tsx` syncs custom workspace models into Zustand store (`useProvidersStore`).
  - Custom models are registered in `apps/sim/providers/models.ts` dynamically with prefix `custom/<provider-name>/<model-id>` or custom provider tag.

### 3. Canvas Block Integration
- **SubBlock Credential Helpers**:
  - `apps/sim/blocks/utils.ts` updated with `customEndpoint` subblock and dynamic condition checks.
  - When `custom` provider or custom model is selected in `AgentBlock`, `RouterBlock`, `EvaluatorBlock`, the Base URL and API Key subblocks appear automatically.
  - Inline `[ Load Models ]` button in block properties panel to quickly inspect or refresh available models for that endpoint.

### 4. Provider Execution Engine
- **Custom Provider Executor**:
  - `apps/sim/providers/custom/index.ts` (or extension of `openai-compat`):
  - Resolves Base URL and API Key in priority order:
    1. Per-block inputs (`customEndpoint`, `apiKey`)
    2. Workspace BYOK / Custom Provider database record
    3. Global environment fallback (`CUSTOM_OPENAI_BASE_URL`, `VLLM_BASE_URL`)
  - Executes chat completions through standard OpenAI / Anthropic client with tool iteration loop and event streaming.

---

## User Experience & Interface Flow

### Workspace Settings Flow
```
[ Workspace Settings ] -> [ AI Providers / Custom Endpoints ]
       │
       ├──> [ Protocol: OpenAI-Compat / Anthropic-Compat ]
       ├──> [ Name: "My Local vLLM" ]
       ├──> [ Base URL: "http://192.168.1.100:8000/v1" ]
       ├──> [ API Key: "••••••••" (Optional) ]
       │
       └──> [ Click: "Load Models" ]
                 │
                 ▼
          (API Fetches /v1/models)
                 │
                 ▼
       ┌─────────────────────────────────────────────────┐
       │ [x] Select All (12 models found)                │
       │                                                 │
       │ [x] deepseek-ai/deepseek-coder-33b              │
       │ [x] meta-llama/Llama-3.3-70B-Instruct           │
       │ [ ] mistralai/Mistral-7B-Instruct-v0.2          │
       │ [x] Qwen/Qwen2.5-Coder-32B-Instruct             │
       │                                                 │
       │ [+ Add Custom Model Manually]                   │
       └─────────────────────────────────────────────────┘
                 │
                 ▼
       [ Save Custom Provider ]
```

### Canvas Block Flow
```
[ Agent Block ] -> [ Model Picker Dropdown ]
                         │
                         ├──> [ Built-in Models (Claude, GPT, Gemini...) ]
                         ├──> [ Custom: My Local vLLM -> Llama-3.3-70B ]
                         └──> [ "Custom Endpoint (Direct Override)..." ]
                                     │
                                     ▼
                              [ Base URL Input ]
                              [ API Key Input  ]
                              [ Load Models / Enter Model ID ]
```

---

## Security & Reliability Considerations

1. **SSRF Boundary**: All user-provided URLs must pass DNS resolution validation (`validateUrlWithDNS`), rejecting AWS metadata endpoints (`169.254.169.254`), cloud internal links, and blocked private IP ranges (unless configured in self-hosted mode with `ALLOW_PRIVATE_DATABASE_HOSTS`).
2. **Encrypted Credentials**: API keys stored at rest are encrypted with `ENCRYPTION_KEY` / `API_ENCRYPTION_KEY` using AES-GCM.
3. **Fault Tolerance**: If an external custom endpoint is unreachable, UI shows user-friendly error banners without crashing the workspace or blocking other provider models.

---

## Verification Plan

### Automated Tests
- Unit test for model discovery endpoint (`POST /api/providers/custom/discover`).
- Contract validation test (`bun run check:api-validation`).
- Provider execution test for custom OpenAI-compatible stream and tool calls.

### Manual Verification
- Test connection against a local OpenAI-compatible server (vLLM, LM Studio, or Ollama `/v1`).
- Test "Load Models" with Select All and individual checkbox selection.
- Test Agent Block execution with the custom model in a real workflow.
