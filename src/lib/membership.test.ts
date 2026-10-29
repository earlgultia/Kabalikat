import { describe, expect, it } from 'vitest'
import { resolveActiveMembership, type Membership } from './membership'

const membership = (overrides: Partial<Membership> = {}): Membership => ({
  id: 'membership-1', barangay_id: 'tenant-a', status: 'active',
  role: { key: 'secretary', label: 'Secretary' },
  barangay: { id: 'tenant-a', name: 'San Isidro', municipality: 'Sample City', province: 'Sample Province' },
  ...overrides,
})

describe('resolveActiveMembership', () => {
  it('selects an active barangay membership', () => {
    expect(resolveActiveMembership([membership()])?.barangay_id).toBe('tenant-a')
  })

  it('rejects revoked memberships and platform roles as barangay context', () => {
    expect(resolveActiveMembership([membership({ status: 'revoked' })])).toBeNull()
    expect(resolveActiveMembership([membership({ role: { key: 'super_admin', label: 'Platform admin', scope: 'platform' } })])).toBeNull()
  })

  it('does not invent a tenant when no membership is returned by the server', () => {
    expect(resolveActiveMembership([])).toBeNull()
  })
})
