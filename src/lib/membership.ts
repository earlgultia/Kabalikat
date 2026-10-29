export type Membership = {
  id: string
  barangay_id: string
  status: string
  role: { key: string; label: string; scope?: string } | null
  barangay: { id: string; name: string; municipality: string; province: string } | null
}

export function resolveActiveMembership(memberships: Membership[]): Membership | null {
  return memberships.find((membership) =>
    membership.status === 'active' && membership.role?.scope !== 'platform' && Boolean(membership.barangay),
  ) ?? null
}
