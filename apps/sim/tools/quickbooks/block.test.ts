import { describe, expect, it } from 'vitest'
import { QuickBooksBlock } from '@/blocks/blocks/quickbooks'

function requiredCondition(fieldId: string, values: Record<string, unknown>) {
  const field = QuickBooksBlock.subBlocks.find((subBlock) => subBlock.id === fieldId)
  if (!field || typeof field.required !== 'function') {
    throw new Error(`${fieldId} does not define a dynamic required condition`)
  }
  return field.required(values)
}

describe('QuickBooks block conditional name requirements', () => {
  it('requires one supported customer or vendor name field', () => {
    expect(requiredCondition('displayName', { operation: 'quickbooks_create_customer' })).toEqual({
      field: 'operation',
      value: 'quickbooks_create_customer',
    })
    expect(
      requiredCondition('displayName', {
        operation: 'quickbooks_create_customer',
        givenName: 'Ada',
      })
    ).toEqual({ field: 'operation', value: [] })
    expect(
      requiredCondition('givenName', {
        operation: 'quickbooks_create_vendor',
        familyName: 'Lovelace',
      })
    ).toEqual({ field: 'operation', value: [] })
  })

  it('requires an employee given or family name even when displayName is supplied', () => {
    expect(
      requiredCondition('givenName', {
        operation: 'quickbooks_create_employee',
        displayName: 'Ada Lovelace',
      })
    ).toEqual({ field: 'operation', value: 'quickbooks_create_employee' })
    expect(
      requiredCondition('givenName', {
        operation: 'quickbooks_create_employee',
        familyName: 'Lovelace',
      })
    ).toEqual({ field: 'operation', value: [] })
  })
})
