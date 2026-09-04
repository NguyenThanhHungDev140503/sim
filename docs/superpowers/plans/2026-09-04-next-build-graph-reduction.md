# Next Build Graph Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `next build` finish on a 7 GB GitHub-hosted runner by removing heavyweight provider definitions and per-model image rendering from build-time static generation.

**Architecture:** Generate a small, committed model-catalog JSON artifact from the canonical `providers/models.ts` source. Landing model routes consume the artifact rather than importing the 4,802-line provider registry. Keep provider and model detail pages statically generated, but render their Open Graph images dynamically at request time so the build does not run Satori/font parsing once per model.

**Tech Stack:** Next.js 16 App Router, TypeScript, Bun, Vitest, GitHub Actions, Docker.

**Spec:** Conversation-approved design on 2026-09-04: preserve static/SEO landing pages while shrinking build-time module graph; do not commit `.next` artifacts.

## Global Constraints

- Keep `providers/models.ts` as application source of truth.
- No new dependency.
- Keep model directory, provider pages, model pages, and existing canonical URLs working.
- Landing model routes must not import `@/providers/models` or `@/providers/utils`.
- Do not pre-render per-model or per-provider Open Graph PNGs in `next build`.
- Keep `bun run check:api-validation` passing.
- Verify `next build` on GitHub hosted `ubuntu-latest` without committing `.next` output.

---

## File Structure

- Create: `packages/deployment-config/model-catalog.json` - build-safe model/provider catalog artifact for landing routes.
- Create: `scripts/generate-model-catalog.ts` - derives artifact from canonical provider definitions.
- Create: `scripts/generate-model-catalog.test.ts` - verifies generated catalog shape and route uniqueness.
- Modify: `packages/deployment-config/package.json` - exports `./model-catalog.json`.
- Modify: `package.json` - adds `model-catalog:generate` and `model-catalog:check` scripts.
- Modify: `apps/sim/app/(landing)/models/utils.ts` - creates catalog projection from JSON artifact, retaining presentation helpers only.
- Modify: `apps/sim/app/(landing)/models/(shell)/[provider]/opengraph-image.tsx` - removes `generateStaticParams`; image resolves dynamically.
- Modify: `apps/sim/app/(landing)/models/(shell)/[provider]/[model]/opengraph-image.tsx` - removes `generateStaticParams`; image resolves dynamically.
- Modify: `.github/workflows/build.yml` - restores ordinary app-image flow after build graph is reduced; removes artifact relay job if no longer needed.
- Modify: `docker/app.Dockerfile` - restores the normal image build and removes experimental CI-only build bypasses.

### Task 1: Add Model Catalog Artifact Generator

**Files:**
- Create: `scripts/generate-model-catalog.ts`
- Create: `scripts/generate-model-catalog.test.ts`
- Create: `packages/deployment-config/model-catalog.json`
- Modify: `package.json`
- Modify: `packages/deployment-config/package.json`

**Interfaces:**
- Consumes: `PROVIDER_DEFINITIONS` from `apps/sim/providers/models.ts`.
- Produces: `model-catalog.json` containing serializable provider/model data only: IDs, names, descriptions, URLs, pricing, capabilities, context window, release dates, and display metadata.
- Does not produce: React icon component references, runtime mutation helpers, provider SDK settings, or executable registry functions.

- [ ] **Step 1: Write failing generator tests**

```ts
import catalog from '../packages/deployment-config/model-catalog.json'
import { describe, expect, it } from 'vitest'

describe('model catalog artifact', () => {
  it('contains unique provider and model URLs', () => {
    const providerHrefs = catalog.providers.map((provider) => provider.href)
    const modelHrefs = catalog.providers.flatMap((provider) => provider.models.map((model) => model.href))

    expect(new Set(providerHrefs).size).toBe(providerHrefs.length)
    expect(new Set(modelHrefs).size).toBe(modelHrefs.length)
  })

  it('contains only serializable landing metadata', () => {
    expect(catalog.providers[0]).toMatchObject({
      id: expect.any(String),
      slug: expect.any(String),
      href: expect.any(String),
      models: expect.any(Array),
    })
    expect(JSON.stringify(catalog)).not.toContain('function')
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bunx vitest run scripts/generate-model-catalog.test.ts`

Expected: FAIL because artifact/generator does not exist.

- [ ] **Step 3: Implement minimal generator**

```ts
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PROVIDER_DEFINITIONS } from '../apps/sim/providers/models'

const outputPath = resolve(import.meta.dir, '../packages/deployment-config/model-catalog.json')

const providers = Object.values(PROVIDER_DEFINITIONS).map(({ icon: _icon, ...provider }) => ({
  ...provider,
  models: provider.models.map(({ capabilities, ...model }) => ({
    ...model,
    capabilities: capabilities ?? {},
  })),
}))

await writeFile(outputPath, `${JSON.stringify({ providers }, null, 2)}\n`)
```

Expand this minimal shape only with fields actually consumed by `models/utils.ts`; do not serialize icon components or executable functions. Add a deterministic `--check` mode that compares generated text with checked-in artifact and exits nonzero on drift.

- [ ] **Step 4: Export and register artifact commands**

Add package export:

```json
"./model-catalog.json": "./model-catalog.json"
```

Add root scripts:

```json
"model-catalog:generate": "bun run scripts/generate-model-catalog.ts",
"model-catalog:check": "bun run scripts/generate-model-catalog.ts --check"
```

- [ ] **Step 5: Generate artifact and run tests**

Run:

```bash
bun run model-catalog:generate
bunx vitest run scripts/generate-model-catalog.test.ts
bun run model-catalog:check
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/deployment-config/package.json packages/deployment-config/model-catalog.json scripts/generate-model-catalog.ts scripts/generate-model-catalog.test.ts
git commit -m "feat: add build-safe model catalog artifact"
```

### Task 2: Move Landing Model Catalog Off Provider Registry

**Files:**
- Modify: `apps/sim/app/(landing)/models/utils.ts`
- Test: `scripts/generate-model-catalog.test.ts`

**Interfaces:**
- Consumes: `@sim/deployment-config/model-catalog.json`.
- Produces: Existing exports from `models/utils.ts`: `ALL_CATALOG_MODELS`, `MODEL_PROVIDERS_WITH_CATALOGS`, `getModelBySlug`, `getProviderBySlug`, and presentation helpers.
- Removes: Runtime import of `PROVIDER_DEFINITIONS` and runtime provider icon components from landing route graph.

- [ ] **Step 1: Extend failing test to enforce boundary**

```ts
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

it('keeps landing model utilities out of the provider registry graph', async () => {
  const source = await readFile(
    resolve(import.meta.dir, '../apps/sim/app/(landing)/models/utils.ts'),
    'utf8'
  )

  expect(source).not.toContain("from '@/providers/models'")
})
```

- [ ] **Step 2: Run test and verify it fails**

Run: `bunx vitest run scripts/generate-model-catalog.test.ts`

Expected: FAIL because `models/utils.ts` imports `@/providers/models`.

- [ ] **Step 3: Replace source import with artifact import**

```ts
import modelCatalog from '@sim/deployment-config/model-catalog.json'
```

Map artifact records into existing `CatalogProvider`/`CatalogModel` objects. Preserve route slug generation, pricing, capabilities, ordering, and uniqueness assertions. Change `CatalogProvider.icon` to a serializable icon key or omit it; resolve visual icons inside client/server display primitives from a small dedicated mapping, never the full provider registry.

- [ ] **Step 4: Run model catalog tests**

Run:

```bash
bunx vitest run scripts/generate-model-catalog.test.ts
bun run model-catalog:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/sim/app/(landing)/models/utils.ts apps/sim/app/(landing)/models/components scripts/generate-model-catalog.test.ts
git commit -m "refactor: decouple landing model catalog from provider registry"
```

### Task 3: Stop Pre-rendering Open Graph Images Per Model

**Files:**
- Modify: `apps/sim/app/(landing)/models/(shell)/[provider]/opengraph-image.tsx`
- Modify: `apps/sim/app/(landing)/models/(shell)/[provider]/[model]/opengraph-image.tsx`
- Test: `apps/sim/app/(landing)/models/(shell)/[provider]/opengraph-image.test.tsx`
- Test: `apps/sim/app/(landing)/models/(shell)/[provider]/[model]/opengraph-image.test.tsx`

**Interfaces:**
- Consumes: artifact-backed model utility lookups.
- Produces: Same dynamic `opengraph-image.png` endpoints for valid provider/model params.
- Removes: `generateStaticParams` from both OG route files.

- [ ] **Step 1: Write failing tests for dynamic OG behavior**

```ts
import { describe, expect, it } from 'vitest'
import Image from './opengraph-image'

describe('model Open Graph image', () => {
  it('renders a PNG for a valid model route', async () => {
    const response = await Image({
      params: Promise.resolve({ provider: 'openai', model: 'gpt-4-1' }),
    })

    expect(response.headers.get('content-type')).toContain('image/png')
  })
})
```

- [ ] **Step 2: Run tests and verify current behavior**

Run:

```bash
bunx vitest run "apps/sim/app/(landing)/models/(shell)/[provider]/opengraph-image.test.tsx"
bunx vitest run "apps/sim/app/(landing)/models/(shell)/[provider]/[model]/opengraph-image.test.tsx"
```

Expected: PASS before removal; test protects request-time rendering behavior.

- [ ] **Step 3: Remove static param exports**

Delete only `generateStaticParams` from both OG files. Keep `contentType`, `size`, valid parameter lookup, `notFound()`, and `createCoverOgImage()` intact.

- [ ] **Step 4: Run OG tests**

Run same commands from Step 2.

Expected: PASS. URLs still render on demand; `next build` no longer invokes Satori/font parsing for every provider/model image.

- [ ] **Step 5: Commit**

```bash
git add "apps/sim/app/(landing)/models/(shell)/[provider]/opengraph-image.tsx" "apps/sim/app/(landing)/models/(shell)/[provider]/[model]/opengraph-image.tsx" "apps/sim/app/(landing)/models/(shell)/[provider]/opengraph-image.test.tsx" "apps/sim/app/(landing)/models/(shell)/[provider]/[model]/opengraph-image.test.tsx"
git commit -m "perf: render model Open Graph images on demand"
```

### Task 4: Restore Normal CI/Docker Build and Verify Build Budget

**Files:**
- Modify: `.github/workflows/build.yml`
- Modify: `docker/app.Dockerfile`

**Interfaces:**
- Consumes: normal repository source plus committed model catalog artifact.
- Produces: GHCR `sim-app` image without a pre-built `.next` artifact relay.
- Removes: `build-nextjs` artifact job and CI-only Docker build bypass introduced during investigation.

- [ ] **Step 1: Restore ordinary app build workflow**

Remove `build-nextjs`, `upload-artifact`, `download-artifact`, and `needs: build-nextjs`. Keep hosted runner, GHCR authentication, Buildx cache, and app job timeout.

- [ ] **Step 2: Restore Docker build responsibility**

Replace artifact-existence check with the normal app build command:

```dockerfile
RUN --mount=type=cache,id=next-cache-${TARGETPLATFORM},target=/app/apps/sim/.next/cache \
    --mount=type=cache,id=turbo-cache-${TARGETPLATFORM},target=/app/.turbo \
    bun run --cwd apps/sim build
```

Keep only CI settings proven necessary after the build graph reduction. Remove `USE_WEBPACK`, `MINIMAL_CI`, low heap experiments, and Docker-specific fake build paths unless a measured run demonstrates need.

- [ ] **Step 3: Run local contract checks**

Run:

```bash
bun run model-catalog:check
bunx vitest run scripts/generate-model-catalog.test.ts
bun run check:api-validation
```

Expected: PASS.

- [ ] **Step 4: Run local build with timing and memory observation**

Run: `time bun run --cwd apps/sim build`

Expected: build completes. Record peak resident memory with the platform's available process monitor; do not claim GitHub viability until its workflow succeeds.

- [ ] **Step 5: Push and verify GitHub Actions**

Run:

```bash
git add .github/workflows/build.yml docker/app.Dockerfile
git commit -m "ci: restore Docker app build after graph reduction"
git push origin main
gh run watch <new-build-run-id> --exit-status
```

Expected: `Build & Push sim-app` completes on `ubuntu-latest`; route build table no longer pre-renders model OG PNGs.

## Review Checklist

- Model catalog artifact derives from canonical provider data and `model-catalog:check` detects drift.
- Landing model code no longer imports `@/providers/models`.
- Model detail and provider detail HTML remain static generated with existing URLs.
- Model OG URLs still return PNGs dynamically.
- Integration catalog remains artifact-backed; do not regress to `@/blocks/registry`.
- CI does not commit or rely on `.next` artifacts.
- GitHub `Build & Push sim-app` passes on hosted runner.
