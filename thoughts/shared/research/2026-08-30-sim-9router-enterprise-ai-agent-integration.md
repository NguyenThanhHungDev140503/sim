---
date: 2026-08-30T23:14:53+07:00
researcher: Codex
git_commit: baa01084b1
git_commit_9router: fccb9f2f
git_branch: main
git_branch_9router: master
repository: sim + 9router
topic: "Phân tích Sim và 9Router để kết hợp thành hệ thống AI Agent cho doanh nghiệp"
tags: [research, codebase, sim, 9router, enterprise-ai-agent, mcp, model-gateway, authorization]
status: complete
last_updated: 2026-08-30
last_updated_by: Codex
---

# Research: Sim + 9Router Enterprise AI Agent

**Date**: 2026-08-30T23:14:53+07:00  
**Researcher**: Codex  
**Sim**: `main` @ `baa01084b1`  
**9Router**: `master` @ `fccb9f2f`

## Research Question

Phân tích Sim, sau đó `/home/nguyen-thanh-hung/Documents/9router`, tìm kiến trúc kết hợp hai nền tảng thành hệ thống AI Agent doanh nghiệp.

## Summary

Không gộp hai codebase thành monolith. Không chia sẻ DB, user table, session, credential vault, hay agent tool loop.

- **Sim = control plane + agent execution plane.** Ownership: workspace/tenant, RBAC, delegated principal, workflow/agent runtime, approval, secrets, audit, MCP policy, realtime UI.
- **9Router = private model-routing data plane.** Ownership: API-format translation, provider/account selection, retry/fallback/combo, quota and provider telemetry.
- **Integration = network boundary.** Sim gọi 9Router qua provider adapter dùng mTLS, short-lived workload JWT, model capability matrix, structured usage events.
- **Một tool loop duy nhất: Sim.** Tắt 9Router MCP injection/ReAct loop cho request từ Sim. stdio/legacy-SSE MCP phải nằm trong bridge sandbox riêng.

```text
Users / API / Triggers
          |
          v
+-----------------------------------------------+
| Sim control + agent execution                 |
| tenant/RBAC, workflow, approval, secrets,     |
| agent loop, MCP policy, audit, traces, UI     |
+-----------------------+-----------------------+
                        | mTLS + bounded workload JWT
                        v
+-----------------------------------------------+
| 9Router private model gateway                 |
| Responses/Chat compatibility, provider route, |
| fallback, quota, provider credentials         |
| No browser access. No enterprise tool loop.   |
+-----------------------+-----------------------+
                        v
              Model providers / account pools

Sim MCP executor ---> Streamable HTTP MCP servers
                        ^
                        | optional isolated stdio/SSE bridge
```

## Detailed Findings

### Sim: enterprise authority and execution

- Monorepo enforces `apps/* -> packages/*`; packages cannot import app code. [boundary checker](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/scripts/check-monorepo-boundaries.ts#L8-L71)
- Principal types include session, personal/workspace API key, delegated, system and credential-group enrollment. Delegated context binds workspace/workflow/execution/deployment authority. [principal.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/packages/auth/src/principal.ts#L1-L117)
- Better Auth verification shares PostgreSQL schema and secret. [verify.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/packages/auth/src/verify.ts#L45-L90)
- Permission lattice: `read < write < admin`; workflow checks active workspace/workflow and effective permission. [predicates.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/packages/platform-authz/src/predicates.ts#L3-L48), [workflow.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/packages/platform-authz/src/workflow.ts#L19-L306)
- Authorized application use case owns canonical loading, asserted-scope validation, authorization, semantic audit and effects. [authorized-workspace-use-case.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/apps/sim/lib/core/application/authorized-workspace-use-case.ts#L151-L218)
- Workflow graph normalizes blocks, edges, subflows; execution snapshots/logs separate. [schema.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/packages/db/schema.ts#L303-L430)
- Workflow archive cascades to schedules, webhooks, chats, MCP tools and deployment state. [lifecycle.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/apps/sim/lib/workflows/lifecycle.ts#L89-L294)
- Executor covers DAG compile, queue, dependency/variable resolution, loops, parallelism, routing, pause/resume. [executor docs](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/apps/sim/content/blog/executor/index.mdx#L44-L190)

**Decision:** Sim remains source of truth for tenant, actor, authority, workflow, run, secret and enterprise audit.

### Sim: model and MCP seams

- Provider registry and executor already separate provider dispatch. [registry.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/apps/sim/providers/registry.ts#L31-L68), [provider-request.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/apps/sim/executor/utils/provider-request.ts#L19-L53)
- MCP client supports Streamable HTTP and pins resolved network addresses. [types.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/apps/sim/lib/mcp/types.ts#L4-L34), [client.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/apps/sim/lib/mcp/client.ts#L107-L122)
- MCP tool operation authorizes, permission-checks, validates arguments and emits telemetry. [execute-tool.ts](https://github.com/NguyenThanhHungDev140503/sim/blob/baa01084b1/apps/sim/lib/mcp/application/execute-tool.ts#L130-L209)

**Integration action:** Add one `9router` provider adapter in Sim. Do not duplicate 9Router routing/fallback logic. Keep native Sim adapters for routes where gateway translation is not certified lossless.

### 9Router: model routing and format compatibility

- Next.js gateway/dashboard calls shared OpenSSE core. Pipeline detects format, translates, executes provider, translates streaming/JSON then records usage. [architecture](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/docs/ARCHITECTURE.md#L7-L25), [provider service](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/services/provider.js#L34-L153), [translator](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/translator/index.js#L52-L219)
- OpenAI-compatible Chat Completions and Responses routes exist. [chat route](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/app/api/v1/chat/completions/route.js#L9-L34), [responses route](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/app/api/v1/responses/route.js#L6-L30)
- Model resolver handles provider/model, local alias, provider node, alias and combo. [model.ts](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/sse/services/model.js#L19-L94)
- Account routing performs credential refresh, unavailable marking and retry. [chat.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/sse/handlers/chat.js#L76-L346), [accountFallback.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/services/accountFallback.js#L9-L215)
- Combos provide fallback, round-robin and parallel fusion/judge. [combo.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/services/combo.js#L108-L635)
- Usage captures provider/model/account/key/endpoint/token/cost/status metadata. [schema.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/lib/db/schema.js#L142-L192)

**Decision:** 9Router is right data plane for provider runtime. It is not enterprise identity, authorization or audit authority.

### 9Router: MCP conflicts

- 9Router supports stdio, Streamable HTTP and legacy SSE transports. [processManager.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/lib/mcp/processManager.js#L62-L118), [httpTransport.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/lib/mcp/httpTransport.js#L21-L75), [sseTransport.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/lib/mcp/sseTransport.js#L15-L146)
- It injects MCP schemas and can execute automatic ReAct tool calls. [inboundInjectionPipeline.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/mcp/inboundInjectionPipeline.js#L24-L104), [toolLoop.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/mcp/toolLoop.js#L17-L99), [toolExecutor.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/mcp/toolExecutor.js#L40-L77)

**Decision:** For Sim-originated requests, 9Router must receive no MCP definitions and must not run inbound injection, tool partition, tool loop or tool executor.

## Ownership Matrix

| Capability | Owner | Why |
|---|---|---|
| Org/workspace, identities, RBAC, API principals | Sim | Existing canonical authz model. |
| Workflows, agents, approvals, HITL | Sim | Must bind all actions to enterprise authority. |
| MCP registry, grants, credentials, tool audit | Sim | Existing app operation and transport pinning. |
| Approved catalog, budget, data-class policy | Sim | Policy decision point. |
| Provider OAuth/API keys and account pools | 9Router | Existing provider runtime. |
| Model selection, fallback/retry/quota | 9Router | Existing router and combo implementation. |
| Format translation, streaming normalization | 9Router | Existing Chat/Responses translator. |
| Semantic business audit | Sim | Principal-attributed operation trail. |
| Low-level provider telemetry | 9Router exported to Sim | Gateway owns request-level facts. |
| stdio/legacy SSE MCP | Isolated bridge | High-risk process/network capability. |

## Integration Contract

Use OpenAI Responses first. Chat Completions only for certified capability paths.

Headers:

```text
Authorization: Bearer <short-lived workload JWT>
X-Sim-Trace-Id: <uuid>
X-Sim-Run-Id: <uuid>
X-Sim-Workspace-Id: <opaque id>
X-Sim-Policy-Version: <version>
```

JWT claims:

```json
{
  "iss": "sim-control-plane",
  "aud": "9router-model-gateway",
  "exp": "<= 5 minutes",
  "jti": "request credential id",
  "tenant_id": "...",
  "workspace_id": "...",
  "actor_id": "...",
  "principal_kind": "session|api_key|delegated|system",
  "workflow_id": "...",
  "execution_id": "...",
  "run_id": "...",
  "policy_version": "...",
  "allowed_model_ids": ["..."],
  "max_input_tokens": 0,
  "max_output_tokens": 0,
  "max_cost_usd": 0
}
```

Gateway rules:

1. Verify issuer, audience, signature, expiry, `jti`, model allowlist and hard cost/token caps.
2. Do not map workload token to 9Router dashboard user or generic API key.
3. Return `gateway_request_id`, chosen provider/model/account alias, fallback/retry decisions, usage, cost and latency.
4. Emit signed append-only usage events keyed by `gateway_request_id` and `trace_id`.
5. Sim records enterprise semantic audit; 9Router records transport/provider telemetry.

## Capability Matrix

| Needed semantics | Route |
|---|---|
| Plain text and normal streaming | Gateway eligible |
| Simple function tools, contract-tested | Eligible after certification |
| Responses tools, reasoning, images, multimodal, structured output | Eligibility per provider/model route |
| MCP call, approval, secret-bearing side effect | Sim tool loop only |
| Native provider feature with translation loss | Sim direct native adapter |

9Router warns format pivots can lose thinking blocks, images, tool IDs and `is_error`. [OpenSSE guidance](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/AGENTS.md#L25-L39)

## Risks and Required Controls

1. **Tool-policy bypass.** 9Router tool loop bypasses Sim approval/RBAC. Disable for Sim workload requests.
2. **Identity collapse.** 9Router key resolves local `userId`, not Sim workspace/run/delegation. Add workload-token verifier; never share user DB. [chat.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/sse/handlers/chat.js#L55-L88)
3. **Public gateway exposure.** API-key enforcement is optional and chat CORS broad. Private network only, mTLS, mandatory service auth, no browser ingress. [chat.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/sse/handlers/chat.js#L76-L88), [route.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/app/api/v1/chat/completions/route.js#L19-L26)
4. **SSRF/DNS rebinding.** 9Router blocks literal loopback/private IP but no DNS pinning shown. Preserve Sim pinning; bridge needs same control. [security.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/lib/mcp/security.js#L21-L75)
5. **Secret leakage.** Never copy Sim credential vault to 9Router. Scope any gateway provider credential by tenant/policy.
6. **Split audit.** Propagate `trace_id`, `run_id`, `actor_id`, `workspace_id`, `policy_version` end-to-end.
7. **MCP server-ID mismatch.** Tools API emits server name; parser expects server ID. Do not use 9Router direct MCP tool API before repair. [tools route](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/src/app/api/mcp/tools/route.js#L28-L43), [toolPartition.js](https://github.com/NguyenThanhHungDev140503/9router/blob/fccb9f2f/open-sse/mcp/toolPartition.js#L25-L39)

## Delivery Plan

### Phase 0 — architecture guardrails

- ADR: Sim owns authority/tool loop; 9Router owns model data plane.
- Capability catalog, threat model, correlation-ID contract.

### Phase 1 — private gateway

- Private 9Router deployment. No public browser ingress.
- mTLS and internal workload-JWT verifier.
- Dedicated internal Responses endpoint plus health/capability/model endpoints.

### Phase 2 — Sim provider adapter

- Add `9router` adapter, Responses streaming client, gateway route metadata.
- Contract fixtures: text, SSE, cancellation, errors, fallback, idempotency, allowed model failure.

### Phase 3 — policy and observability

- Sim enforces model allowlist, budget, data class, request limits before call.
- 9Router duplicates hard caps from signed claims.
- Usage event ingestion and daily ledger reconciliation.

### Phase 4 — controlled MCP bridge

- Sim Streamable HTTP MCP remains default.
- If stdio/SSE required: per-tenant sandbox, command/egress/filesystem/CPU/memory/time limits, DNS pinning. Expose only Streamable HTTP to Sim.

### Phase 5 — enterprise hardening

- Approval rules, replay-safe idempotency, retention/deletion/legal hold, encryption/data-residency policy, outage/retry-storm/load testing.

## Anti-Patterns

- Do not merge PostgreSQL and 9Router SQLite schemas.
- Do not reuse 9Router JWT/API key as enterprise credential.
- Do not expose 9Router public `/v1` directly to browser/end-user traffic.
- Do not send Sim MCP definitions into 9Router autonomous loop.
- Do not duplicate routing/fallback policy in both services.
- Do not treat 9Router usage SQLite ledger as billing source of truth.

## Open Questions

1. Provider/account pool shared by tenant, workspace, or dedicated customer deployment?
2. Which model features need lossless tool/reasoning/multimodal behavior at launch?
3. Which side effects require approval: external send, CRM write, payment, deploy, export?
4. Deployment model: single enterprise, SaaS, on-prem/VPC, hybrid?
5. Billing: central pool, BYOK, credits, chargeback?
6. Compliance: SOC 2, ISO 27001, GDPR, HIPAA, residency?

## Historical Context

No `thoughts/` directory existed in Sim at research time. 9Router planning/research exists, but live code was primary source.

## Related Research

No earlier Sim research document found.
