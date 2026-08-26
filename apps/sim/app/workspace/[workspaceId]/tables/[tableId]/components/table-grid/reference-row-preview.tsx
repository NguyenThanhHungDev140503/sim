'use client'

import { memo, type ReactNode, useLayoutEffect, useMemo, useRef } from 'react'
import { buttonVariants } from '@sim/emcn'
import { Loader } from '@sim/emcn/icons'
import { noop } from '@sim/utils/helpers'
import Link from 'next/link'
import { columnTypeById } from '@/lib/table/column-types'
import { CellContent } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/cells'
import { ColumnTypeIcon } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/headers/column-type-icon'
import { expandToDisplayColumns } from '@/app/workspace/[workspaceId]/tables/[tableId]/components/table-grid/utils'
import { useTable, useTableRow } from '@/hooks/queries/tables'

/**
 * Must match the sticky anchor's `h-[144px]` class below because the row
 * virtualizer reserves this exact height. The zero-width anchor stays sticky
 * across the full table width without JavaScript-driven positioning.
 */
export const REFERENCE_ROW_PREVIEW_HEIGHT = 144

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
  const previewCellRef = useRef<HTMLTableCellElement>(null)
  const previewShellRef = useRef<HTMLDivElement>(null)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const tableQuery = useTable(workspaceId, referenceTableId)
  const rowQuery = useTableRow(workspaceId, referenceTableId, referenceRowId)
  const table = tableQuery.data
  const row = rowQuery.data
  const columns = useMemo(
    () => expandToDisplayColumns(table?.schema.columns ?? [], []),
    [table?.schema.columns]
  )

  useLayoutEffect(() => {
    const previewCell = previewCellRef.current
    const previewShell = previewShellRef.current
    const scrollRoot = previewCell?.closest<HTMLElement>('[data-table-scroll]')
    if (!previewCell || !previewShell || !scrollRoot) return

    let previousWidth: number | null = null
    let previousScrollLeft = scrollRoot.scrollLeft

    const updateWidth = () => {
      const cellBounds = previewCell.getBoundingClientRect()
      const viewportBounds = scrollRoot.getBoundingClientRect()
      const viewportLeft = viewportBounds.left + scrollRoot.clientLeft
      const viewportRight = viewportLeft + scrollRoot.clientWidth
      const visibleLeft = Math.max(cellBounds.left, viewportLeft)
      const visibleRight = Math.min(cellBounds.right, viewportRight)
      const width = Math.max(0, visibleRight - visibleLeft)
      if (width === previousWidth) return
      previousWidth = width
      previewShell.style.setProperty('--reference-preview-width', `${width}px`)
    }

    const handleScroll = () => {
      if (scrollRoot.scrollLeft === previousScrollLeft) return
      previousScrollLeft = scrollRoot.scrollLeft
      updateWidth()
    }

    updateWidth()
    scrollRoot.addEventListener('scroll', handleScroll, { passive: true })

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateWidth)
    resizeObserver?.observe(scrollRoot)
    resizeObserver?.observe(previewCell)

    return () => {
      scrollRoot.removeEventListener('scroll', handleScroll)
      resizeObserver?.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const previewViewport = previewViewportRef.current
    if (!previewViewport) return

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      previewViewport.scrollLeft += event.deltaX
    }

    previewViewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => previewViewport.removeEventListener('wheel', handleWheel)
  }, [])

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
      <div role='table' className='grid h-full w-full min-w-max grid-rows-2 text-small'>
        <div role='row' className='flex min-w-max'>
          {columns.map((column) => (
            <div
              role='columnheader'
              key={column.key}
              className='flex w-40 min-w-40 items-center border-[var(--border)] border-r border-b bg-[var(--bg)] px-2 font-normal'
            >
              <span className='flex min-w-0 items-center gap-1.5'>
                <ColumnTypeIcon type={column.type} />
                <span className='truncate text-[var(--text-secondary)]'>{column.name}</span>
              </span>
            </div>
          ))}
          <div
            aria-hidden
            className='min-w-0 flex-1 border-[var(--border)] border-b bg-[var(--bg)]'
          />
        </div>
        <div role='row' className='flex min-w-max'>
          {columns.map((column) => (
            <div
              role='cell'
              key={column.key}
              className='flex w-40 min-w-40 max-w-60 items-center border-[var(--border)] border-r px-2 text-[var(--text-primary)]'
            >
              <div className='w-full min-w-0 max-w-56 overflow-clip text-ellipsis whitespace-nowrap'>
                <CellContent
                  value={row.data[column.key]}
                  column={column}
                  workspaceId={workspaceId}
                  isEditing={false}
                  onSave={noop}
                  onCancel={noop}
                />
              </div>
            </div>
          ))}
          <div aria-hidden className='min-w-0 flex-1 bg-[var(--bg)]' />
        </div>
      </div>
    )
  }

  return (
    <tr>
      <td
        ref={previewCellRef}
        colSpan={colSpan}
        className='overflow-clip border-[var(--border)] border-r border-b bg-[var(--surface-2)] p-0'
      >
        <div className='sticky left-0 h-[144px] w-0'>
          <div
            ref={previewShellRef}
            className='flex h-full w-[var(--reference-preview-width,100cqw)] min-w-0 flex-col bg-[var(--surface-2)]'
          >
            <div className='flex h-9 shrink-0 items-center gap-1.5 px-3 text-[var(--text-primary)] text-small'>
              <ReferenceIcon className='size-[14px] text-[var(--text-icon)]' />
              <span className='font-medium'>{table?.name ?? 'Referenced table'}</span>
            </div>

            <div
              ref={previewViewportRef}
              className='h-[72px] shrink-0 overflow-x-auto overflow-y-hidden overscroll-x-contain border-[var(--border)] border-y bg-[var(--bg)]'
            >
              {content}
            </div>

            <div className='flex h-9 shrink-0 items-center bg-[var(--bg)] px-3'>
              <Link
                href={`/workspace/${workspaceId}/tables/${referenceTableId}`}
                className={buttonVariants({ variant: 'default', size: 'sm' })}
              >
                Go to table
              </Link>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
})
