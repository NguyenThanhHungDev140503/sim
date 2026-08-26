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
  ArrowRight: () => null,
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderPreview() {
  const preview = (
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

  act(() => {
    root.render(<div data-table-scroll>{preview}</div>)
  })
}

function horizontalRect(left: number, right: number): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left,
    right,
    top: 0,
    width: right - left,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }
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
    const goToTableLink = container.querySelector('a[aria-label="Go to table"]')
    expect(goToTableLink?.getAttribute('href')).toBe('/workspace/workspace-1/tables/table-accounts')
    expect(goToTableLink?.getAttribute('title')).toBe('Go to table')
    expect(goToTableLink?.className).toContain('size-[20px]')
    expect(goToTableLink?.className).toContain('hover-hover:bg-[var(--surface-active)]')
    expect(goToTableLink?.parentElement?.className).toContain('h-9')
    expect(goToTableLink?.parentElement?.className).toContain('gap-1.5')
    expect(goToTableLink?.previousElementSibling?.textContent).toBe('Accounts')
    expect(goToTableLink?.textContent).toBe('')
    const previewShell = container.querySelector<HTMLElement>('tbody > tr > td > div > div')
    expect(previewShell?.lastElementChild?.className).toContain('h-9')
    expect(previewShell?.lastElementChild?.querySelector('a')).toBeNull()
    const previewCell = container.querySelector('tbody > tr > td')
    expect(previewCell?.className).toContain('overflow-clip')
    expect(previewCell?.className).toContain('border-r')
    expect(container.querySelector('td > div')?.className).toContain('sticky left-0')
    expect(container.querySelector('td > div')?.className).toContain('w-0')
    expect(container.querySelector('td > div')?.className).toContain(
      `h-[${REFERENCE_ROW_PREVIEW_HEIGHT}px]`
    )
    const subtable = container.querySelector('[role="table"]')
    expect(subtable?.className).toContain('w-full')
    expect(subtable?.className).toContain('h-full')
    expect(subtable?.className).not.toContain('cursor-default')
    expect(subtable?.className).not.toContain('select-none')
    expect(subtable?.className).toContain('grid-rows-2')
    expect(subtable?.querySelectorAll('[role="row"]')).toHaveLength(2)
    expect(subtable?.querySelectorAll('[role="columnheader"]')).toHaveLength(2)
    expect(subtable?.querySelectorAll('[role="cell"]')).toHaveLength(2)
    const dataValueWrappers = subtable?.querySelectorAll('[role="cell"] > div') ?? []
    expect(
      Array.from(dataValueWrappers).every(
        (node) =>
          node.classList.contains('w-full') &&
          node.classList.contains('min-w-0') &&
          node.classList.contains('overflow-clip')
      )
    ).toBe(true)
    const subtableViewport = container.querySelector('.overscroll-x-contain')
    expect(subtableViewport?.className).toContain('overflow-x-auto')
    expect(subtableViewport?.className).toContain('overflow-y-hidden')
    expect(subtableViewport?.className).toContain('border-y')
    expect(container.innerHTML).not.toContain('rounded-md')
  })

  it('scrolls horizontally when wheel input starts on cell text', () => {
    renderPreview()

    const subtableViewport = container.querySelector<HTMLElement>('.overscroll-x-contain')
    const cellText = Array.from(container.querySelectorAll('[role="cell"] span')).find(
      (element) => element.textContent === 'Acme'
    )
    if (!subtableViewport || !cellText) throw new Error('Expected the referenced row preview')

    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: 80,
    })
    act(() => {
      cellText.dispatchEvent(wheelEvent)
    })

    expect(subtableViewport.scrollLeft).toBe(80)
    expect(wheelEvent.defaultPrevented).toBe(true)

    const verticalWheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: 10,
      deltaY: 80,
    })
    act(() => {
      cellText.dispatchEvent(verticalWheelEvent)
    })

    expect(subtableViewport.scrollLeft).toBe(80)
    expect(verticalWheelEvent.defaultPrevented).toBe(false)
  })

  it('sizes the inner scroller to the visible portion of the preview cell', () => {
    let previewCellRight = 1_500
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.matches('[data-table-scroll]')) return horizontalRect(100, 920)
      if (this.matches('tbody > tr > td')) return horizontalRect(-500, previewCellRight)
      return horizontalRect(0, 0)
    })
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function () {
      return this.matches('[data-table-scroll]') ? 800 : 0
    })
    renderPreview()

    const previewShell = container.querySelector<HTMLElement>('tbody > tr > td > div > div')
    expect(previewShell?.style.getPropertyValue('--reference-preview-width')).toBe('800px')

    previewCellRight = 780
    const scrollRoot = container.querySelector<HTMLElement>('[data-table-scroll]')
    if (!scrollRoot) throw new Error('Expected the table scroll root to be rendered')
    scrollRoot.scrollLeft = 120
    act(() => {
      scrollRoot.dispatchEvent(new Event('scroll'))
    })

    expect(previewShell?.style.getPropertyValue('--reference-preview-width')).toBe('680px')
  })

  it('updates on resize and releases its observer and scroll listener', () => {
    let previewCellRight = 1_500
    let resizeCallback: ResizeObserverCallback | null = null
    let resizeObserver: ResizeObserver | null = null
    const observe = vi.fn()
    const disconnect = vi.fn()

    class MockResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
        resizeObserver = this
      }

      observe(target: Element, options?: ResizeObserverOptions) {
        observe(target, options)
      }

      unobserve() {}

      disconnect() {
        disconnect()
      }
    }

    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.matches('[data-table-scroll]')) return horizontalRect(100, 900)
      if (this.matches('tbody > tr > td')) return horizontalRect(-500, previewCellRight)
      return horizontalRect(0, 0)
    })
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function () {
      return this.matches('[data-table-scroll]') ? 800 : 0
    })
    const registeredListeners: Array<{
      target: EventTarget
      type: string
      listener: EventListenerOrEventListenerObject | null
    }> = []
    const removedListeners: typeof registeredListeners = []
    const originalAddEventListener = EventTarget.prototype.addEventListener
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(
      function (type, listener, options) {
        registeredListeners.push({ target: this, type, listener })
        originalAddEventListener.call(this, type, listener, options)
      }
    )
    vi.spyOn(EventTarget.prototype, 'removeEventListener').mockImplementation(
      function (type, listener, options) {
        removedListeners.push({ target: this, type, listener })
        originalRemoveEventListener.call(this, type, listener, options)
      }
    )

    renderPreview()

    const previewShell = container.querySelector<HTMLElement>('tbody > tr > td > div > div')
    const scrollRoot = container.querySelector<HTMLElement>('[data-table-scroll]')
    const previewCell = container.querySelector<HTMLElement>('tbody > tr > td')
    const previewViewport = container.querySelector<HTMLElement>('.overscroll-x-contain')
    if (!scrollRoot) throw new Error('Expected the table scroll root to be rendered')
    if (!previewCell) throw new Error('Expected the preview cell to be rendered')
    if (!previewViewport) throw new Error('Expected the preview viewport to be rendered')
    const scrollListener = registeredListeners.find(
      ({ target, type }) => target === scrollRoot && type === 'scroll'
    )?.listener
    const wheelListener = registeredListeners.find(
      ({ target, type }) => target === previewViewport && type === 'wheel'
    )?.listener
    if (!scrollListener) throw new Error('Expected the scroll listener to be registered')
    if (!wheelListener) throw new Error('Expected the wheel listener to be registered')
    expect(observe).toHaveBeenCalledTimes(2)
    expect(observe.mock.calls.some(([target]) => target === scrollRoot)).toBe(true)
    expect(observe.mock.calls.some(([target]) => target === previewCell)).toBe(true)

    previewCellRight = 780
    if (!resizeCallback || !resizeObserver) {
      throw new Error('Expected the resize observer to be initialized')
    }
    act(() => resizeCallback([], resizeObserver))

    expect(previewShell?.style.getPropertyValue('--reference-preview-width')).toBe('680px')

    act(() => root.render(null))

    expect(disconnect).toHaveBeenCalledOnce()
    expect(removedListeners).toContainEqual({
      target: scrollRoot,
      type: 'scroll',
      listener: scrollListener,
    })
    expect(removedListeners).toContainEqual({
      target: previewViewport,
      type: 'wheel',
      listener: wheelListener,
    })
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
