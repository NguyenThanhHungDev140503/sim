/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DisplayColumn } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/types'

vi.mock('@sim/emcn', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Checkbox: () => null,
  Chip: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  Tooltip: {
    Root: ({ children }: { children: React.ReactNode }) => children,
    Trigger: ({ children }: { children: React.ReactNode }) => children,
    Content: ({ children }: { children: React.ReactNode }) => children,
  },
}))

vi.mock('@/app/workspace/[workspaceId]/logs/utils', () => ({
  StatusBadge: () => null,
}))

vi.mock(
  '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/cells/sim-resource-cell',
  () => ({ SimResourceCell: () => null })
)

vi.mock('@/app/workspace/[workspaceId]/tables/[tableId]/components/select-field', () => ({
  resolveSelectOptions: () => [],
  SelectPill: () => null,
}))

import {
  CellRender,
  resolveCellRender,
} from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/cells/cell-render'

const REFERENCE_COLUMN: DisplayColumn = {
  id: 'col-account',
  key: 'col-account',
  name: 'Account',
  type: 'reference',
  referenceTableId: 'table-accounts',
  groupSize: 1,
  groupStartColIndex: 0,
  headerLabel: 'Account',
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

describe('reference cell rendering', () => {
  it('resolves a stored row ID to a chip labeled with the reference column name', () => {
    expect(
      resolveCellRender({
        value: 'row-account-1',
        exec: undefined,
        column: REFERENCE_COLUMN,
        waitingOnLabels: undefined,
      })
    ).toMatchObject({ kind: 'column-chip', label: 'Account' })
  })

  it('keeps an empty reference cell empty', () => {
    expect(
      resolveCellRender({
        value: '',
        exec: undefined,
        column: REFERENCE_COLUMN,
        waitingOnLabels: undefined,
      })
    ).toEqual({ kind: 'empty' })
  })

  it('opens the referenced row from the chip without exposing its stored row ID', () => {
    const onReferenceClick = vi.fn()

    act(() => {
      root.render(
        <CellRender
          kind={resolveCellRender({
            value: 'row-account-1',
            exec: undefined,
            column: REFERENCE_COLUMN,
            waitingOnLabels: undefined,
          })}
          isEditing={false}
          referenceAction={{ expanded: false, onClick: onReferenceClick }}
        />
      )
    })

    const chip = container.querySelector('button')
    expect(chip?.textContent).toBe('Account')

    act(() => chip?.click())

    expect(onReferenceClick).toHaveBeenCalledOnce()
    expect(container.textContent).not.toContain('row-account-1')
  })
})
