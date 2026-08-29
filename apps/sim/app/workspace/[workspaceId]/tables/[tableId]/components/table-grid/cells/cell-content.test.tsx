/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createTableColumn } from '@sim/testing'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DisplayColumn } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/types'

vi.mock(
  '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/cells/cell-render',
  () => ({
    resolveCellRender: () => ({ kind: 'empty' }),
    CellRender: () => null,
  })
)

vi.mock(
  '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/cells/inline-editors',
  () => ({ InlineEditor: () => <input data-testid='inline-editor' /> })
)

import { CellContent } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/cells/cell-content'

const COLUMN: DisplayColumn = {
  ...createTableColumn({ id: 'col-name', name: 'Name', type: 'string' }),
  key: 'col-name',
  groupSize: 1,
  groupStartColIndex: 0,
  headerLabel: 'Name',
  isGroupStart: true,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    root = createRoot(container)
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('CellContent', () => {
  it('keeps the inline editor below the sticky table header', () => {
    act(() => {
      root.render(
        <CellContent
          value='Acme'
          column={COLUMN}
          workspaceId='workspace-1'
          isEditing
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      )
    })

    const editorLayer = container.querySelector('[data-testid="inline-editor"]')?.parentElement
    expect(editorLayer?.className).toContain('z-[9]')
    expect(editorLayer?.className).not.toContain('z-10')
  })
})
