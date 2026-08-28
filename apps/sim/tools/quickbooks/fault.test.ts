/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { formatQuickBooksFaultDetail, sanitizeQuickBooksFaultData } from '@/tools/quickbooks/fault'

describe('QuickBooks fault handling', () => {
  it('retains only documented fields and bounds remote error content', () => {
    const fault = sanitizeQuickBooksFaultData({
      Fault: {
        Error: Array.from({ length: 7 }, (_, index) => ({
          code: String(index),
          Message: `message-${index}`,
          Detail: 'x'.repeat(600),
          injected: 'must not escape',
        })),
      },
    })

    expect(fault?.Fault.Error).toHaveLength(5)
    expect(fault?.Fault.omittedErrorCount).toBe(2)
    expect(fault?.Fault.Error[0]).not.toHaveProperty('injected')
    expect(fault?.Fault.Error[0].Detail).toHaveLength(500)
  })

  it('preserves omission counts across repeated sanitization', () => {
    const first = sanitizeQuickBooksFaultData({
      Fault: {
        Error: Array.from({ length: 6 }, (_, index) => ({
          Message: `error-${index}`,
        })),
      },
    })
    const second = sanitizeQuickBooksFaultData(first)

    expect(second?.Fault.omittedErrorCount).toBe(1)
  })

  it('adds actionable stale SyncToken guidance', () => {
    const fault = sanitizeQuickBooksFaultData({
      Fault: {
        Error: [
          {
            code: '5010',
            Message: 'Stale Object Error',
            Detail: 'You and another user were working on this at the same time.',
            element: 'SyncToken',
          },
        ],
      },
    })

    expect(fault).not.toBeNull()
    expect(formatQuickBooksFaultDetail(fault!)).toContain(
      'Re-read the record to obtain its current SyncToken, then retry the write.'
    )
  })

  it.each([null, [], {}, { Fault: {} }, { Fault: { Error: [] } }])(
    'does not claim malformed fault payloads: %j',
    (payload) => {
      expect(sanitizeQuickBooksFaultData(payload)).toBeNull()
    }
  )
})
