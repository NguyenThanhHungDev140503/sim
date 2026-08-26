'use client'

import { memo, type ReactNode, useMemo } from 'react'
import { Loader } from '@sim/emcn/icons'
import { noop } from '@sim/utils/helpers'
import { columnTypeById } from '@/lib/table/column-types'
import { CellContent } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/cells'
import { ColumnTypeIcon } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/headers/column-type-icon'
import { expandToDisplayColumns } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/utils'
import { useTable, useTableRow } from '@/hooks/queries/tables'

/**
 * Must match the sticky anchor's `h-[184px]` class below because the row
 * virtualizer reserves this exact height. The zero-width anchor stays sticky
 * across the full table width, while its `100cqw` child uses TableGrid's
 * inline-size query container to cover the visible viewport.
 */
export const REFERENCE_ROW_PREVIEW_HEIGHT = 184

const ReferenceIcon = columnTypeById('reference').icon

interface ReferenceRowPreviewProps {
  workspaceId: string
  referenceTableId: string
  referenceRowId: string
  colSpan: number
}

export const ReferenceRowPreview = memo(function ReferenceRowPreview({
  workspaceId,
  referenceTableId,
  referenceRowId,
  colSpan,
}: ReferenceRowPreviewProps) {
  const tableQuery = useTable(workspaceId, referenceTableId)
  const rowQuery = useTableRow(workspaceId, referenceTableId, referenceRowId)
  const table = tableQuery.data
  const row = rowQuery.data
  const columns = useMemo(
    () => expandToDisplayColumns(table?.schema.columns ?? [], []),
    [table?.schema.columns]
  )

  let content: ReactNode
  if (tableQuery.isLoading || rowQuery.isLoading) {
    content = (
      <div className='flex h-full items-center justify-center gap-2 text-[var(--text-muted)] text-small'>
        <Loader animate className='size-[14px]' />
        Loading referenced row
      </div>
    )
  } else if (tableQuery.isError || rowQuery.isError) {
    content = (
      <div className='flex h-full items-center justify-center text-[var(--text-muted)] text-small'>
        Couldn&apos;t load referenced row
      </div>
    )
  } else if (!row) {
    content = (
      <div className='flex h-full items-center justify-center text-[var(--text-muted)] text-small'>
        No matching row
      </div>
    )
  } else if (columns.length === 0) {
    content = (
      <div className='flex h-full items-center justify-center text-[var(--text-muted)] text-small'>
        This table has no columns
      </div>
    )
  } else {
    content = (
      <table className='w-[100cqw] min-w-max border-collapse border-[var(--border)] border-t border-b text-small'>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} className='w-40' />
          ))}
          <col />
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className='h-9 w-40 min-w-40 border-[var(--border)] border-r border-b bg-[var(--bg)] px-2 text-left font-normal'
              >
                <span className='flex min-w-0 items-center gap-1.5'>
                  <ColumnTypeIcon type={column.type} />
                  <span className='truncate text-[var(--text-secondary)]'>{column.name}</span>
                </span>
              </th>
            ))}
            <th aria-hidden className='h-9 border-[var(--border)] border-b bg-[var(--bg)]' />
          </tr>
        </thead>
        <tbody>
          <tr>
            {columns.map((column) => (
              <td
                key={column.key}
                className='h-9 w-40 min-w-40 max-w-60 border-[var(--border)] border-r px-2 text-[var(--text-primary)]'
              >
                <div className='max-w-56 overflow-hidden text-ellipsis whitespace-nowrap'>
                  <CellContent
                    value={row.data[column.key]}
                    column={column}
                    workspaceId={workspaceId}
                    isEditing={false}
                    onSave={noop}
                    onCancel={noop}
                  />
                </div>
              </td>
            ))}
            <td aria-hidden className='h-9' />
          </tr>
        </tbody>
      </table>
    )
  }

  return (
    <tr>
      <td colSpan={colSpan} className='border-[var(--border)] border-b bg-[var(--surface-2)] p-0'>
        <div className='sticky left-0 h-[184px] w-0'>
          <div className='flex h-full w-[100cqw] min-w-0 flex-col border-[var(--border)] border-t border-b bg-[var(--surface-2)]'>
            <div className='flex h-9 shrink-0 items-center gap-1.5 px-3 text-[var(--text-primary)] text-small'>
              <ReferenceIcon className='size-[14px] text-[var(--text-icon)]' />
              <span className='font-medium'>{table?.name ?? 'Referenced table'}</span>
            </div>

            <div className='min-h-0 flex-1 overflow-auto overscroll-x-contain bg-[var(--bg)]'>
              {content}
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
})
