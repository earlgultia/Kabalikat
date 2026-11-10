import { describe, expect, it } from 'vitest'
import { getVisibleWorkspaceNavigation } from './workspace-navigation'

const allFeatures = { core_services: true, finance: true, community_programs: true, public_safety: true }
const sections = (role: string) => getVisibleWorkspaceNavigation(role, allFeatures, false).map((item) => item.section)

describe('role dashboard navigation', () => {
  it('keeps Captain administration and shared operations available', () => {
    expect(sections('captain')).toEqual(expect.arrayContaining(['members', 'barangay-settings', 'invitations', 'finance', 'committees', 'sk-projects', 'patrols']))
  })

  it('limits Secretary navigation to records and supported community operations', () => {
    expect(sections('secretary')).toEqual(expect.arrayContaining(['residents', 'documents', 'meetings', 'announcements', 'archive', 'referrals', 'committees']))
    expect(sections('secretary')).not.toContain('finance')
    expect(sections('secretary')).not.toContain('members')
  })

  it('gives Treasurer finance access without Captain administration', () => {
    expect(sections('treasurer')).toContain('finance')
    expect(sections('treasurer')).not.toContain('members')
    expect(sections('treasurer')).not.toContain('invitations')
  })

  it('gives Kagawad committee and meeting workflows', () => {
    expect(sections('kagawad')).toEqual(expect.arrayContaining(['committees', 'meetings', 'projects']))
    expect(sections('kagawad')).not.toContain('members')
  })

  it('gives SK Chairperson SK project and event workspaces', () => {
    expect(sections('sk_chairperson')).toEqual(expect.arrayContaining(['sk-projects', 'sk-events', 'sk-accomplishments']))
    expect(sections('sk_chairperson')).not.toContain('members')
  })

  it('gives Health Workers outreach workflows without patrol management', () => {
    expect(sections('bhw')).toEqual(expect.arrayContaining(['health-outreach', 'sk-events', 'community-calendar']))
    expect(sections('bhw')).not.toContain('patrols')
    expect(sections('bhw')).not.toContain('incidents')
  })

  it('gives Tanod safety and patrol workflows without finance access', () => {
    expect(sections('tanod')).toEqual(expect.arrayContaining(['incidents', 'patrols', 'advisories']))
    expect(sections('tanod')).not.toContain('finance')
  })

  it('gives residents their self-service and published community pages', () => {
    expect(sections('resident')).toEqual(expect.arrayContaining(['residents', 'documents', 'announcements', 'meetings', 'incidents']))
    expect(sections('resident')).not.toContain('members')
    expect(sections('resident')).not.toContain('finance')
    expect(sections('resident')).not.toContain('patrols')
  })

  it('shows no paid feature pages after plan feature loading fails', () => {
    expect(getVisibleWorkspaceNavigation('captain', undefined, false).map((item) => item.section)).toEqual(['overview', 'members', 'barangay-settings', 'tenant-subscription', 'invitations', 'support'])
  })

  it('keeps feature navigation during loading, then honors disabled plan groups', () => {
    expect(getVisibleWorkspaceNavigation('treasurer', undefined, true).map((item) => item.section)).toContain('finance')
    expect(getVisibleWorkspaceNavigation('treasurer', { finance: false, community_programs: true }, false).map((item) => item.section)).not.toContain('finance')
  })
})
