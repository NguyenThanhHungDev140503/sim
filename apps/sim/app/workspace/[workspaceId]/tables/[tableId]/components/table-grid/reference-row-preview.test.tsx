/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createTableColumn, createTableDefinition, createTableRow } from '@sim/testing'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { tableQuery, rowQuery } = vi.hoisted(() => ({
  tableQuery: {
    data: undefined as ReturnType<typeof createTableDefinition> | undefined,
    isLoading: false,
    isError: false,
  },
  rowQuery: {
    data: undefined as ReturnType<typeof createTableRow> | null | undefined,
    isLoading: false,
    isError: false,
  },
}))

vi.mock('@/hooks/queries/tables', () => ({
  useTable: () => tableQuery,
  useTableRow: () => rowQuery,
}))

vi.mock('@/lib/table/column-types', () => ({
  columnTypeById: () => ({ icon: () => null }),
}))

vi.mock('@sim/emcn/icons', () => ({
  Loader: () => null,
}))

vi.mock('@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/cells', () => ({
  CellContent: ({ value }: { value: unknown }) => <span>{String(value)}</span>,
}))

vi.mock(
  '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/headers/column-type-icon',
  () => ({ ColumnTypeIcon: () => null })
)

import {
  REFERENCE_ROW_PREVIEW_HEIGHT,
  ReferenceRowPreview,
} from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/reference-row-preview'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const columns = [
    createTableColumn({ id: 'col-name', name: 'Name', type: 'string' }),
    createTableColumn({ id: 'col-tier', name: 'Tier', type: 'string' }),
  ]
  tableQuery.data = createTableDefinition({
    id: 'table-accounts',
    name: 'Accounts',
    columns,
  })
  tableQuery.isLoading = false
  tableQuery.isError = false
  rowQuery.data = createTableRow({
    id: 'row-account-1',
    data: { 'col-name': 'Acme', 'col-tier': 'Enterprise' },
  })
  rowQuery.isLoading = false
  rowQuery.isError = false
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

function renderPreview() {
  act(() => {
    root.render(
      <table>
        <tbody>
          <ReferenceRowPreview
            workspaceId='workspace-1'
            referenceTableId='table-accounts'
            referenceRowId='row-account-1'
            colSpan={3}
          />
        </tbody>
      </table>
    )
  })
}

describe('ReferenceRowPreview', () => {
  it('shows the referenced table schema and the matching row inline', () => {
    renderPreview()

    expect(container.textContent).toContain('Accounts')
    expect(container.textContent).toContain('Name')
    expect(container.textContent).toContain('Tier')
    expect(container.textContent).toContain('Acme')
    expect(container.textContent).toContain('Enterprise')
    expect(container.textContent).not.toContain('Open in sub view')
    const goToTableLink = Array.from(container.querySelectorAll('a')).find(
      (link) => link.textContent === 'Go to table'
    )
    expect(goToTableLink?.getAttribute('href')).toBe('/workspace/workspace-1/tables/table-accounts')
    expect(goToTableLink?.parentElement?.className).toContain('h-9')
    const previewCell = container.querySelector('tbody > tr > td')
    expect(previewCell?.className).toContain('overflow-clip')
    expect(previewCell?.className).toContain('border-r')
    expect(container.querySelector('td > div')?.className).toContain('sticky left-0')
    expect(container.querySelector('td > div')?.className).toContain('w-0')
    expect(container.querySelector('td > div')?.className).toContain(
      `h-[${REFERENCE_ROW_PREVIEW_HEIGHT}px]`
    )
    const subtable = container.querySelector('td table')
    expect(subtable?.className).toContain('w-[100cqw]')
    expect(subtable?.className).toContain('border-t')
    expect(subtable?.className).toContain('border-b')
    expect(subtable?.querySelectorAll('col')).toHaveLength(3)
    expect(container.querySelector('.overscroll-x-contain')?.className).toContain(
      'overscroll-x-contain'
    )
    expect(container.innerHTML).not.toContain('rounded-md')
  })

  it('shows no match when the stored row ID does not resolve', () => {
    rowQuery.data = null

    renderPreview()

    expect(container.textContent).toContain('No matching row')
  })

  it('shows a loading state while either referenced resource is loading', () => {
    rowQuery.isLoading = true

    renderPreview()

    expect(container.textContent).toContain('Loading referenced row')
  })

  it('keeps non-404 failures distinct from missing rows', () => {
    rowQuery.isError = true

    renderPreview()

    expect(container.textContent).toContain("Couldn't load referenced row")
    expect(container.textContent).not.toContain('No matching row')
  })

  it('shows an empty-schema state when the referenced table has no columns', () => {
    if (!tableQuery.data) throw new Error('Expected the table fixture to be initialized')
    tableQuery.data.schema.columns = []

    renderPreview()

    expect(container.textContent).toContain('This table has no columns')
  })
})
