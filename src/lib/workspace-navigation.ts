import { AlertTriangle, Archive, ArrowLeftRight, Award, Bell, CalendarDays, CircleDollarSign, ClipboardList, FileCheck2, FileText, FolderKanban, Headset, HeartHandshake, LayoutDashboard, Megaphone, MessageSquare, Settings2, UserPlus, Users, UsersRound, type LucideIcon } from 'lucide-react'
import type { OperationSection } from '../features/operations/OperationsSection'

export type PlanFeatureKey = 'core_services' | 'finance' | 'community_programs' | 'public_safety'
export type WorkspaceNavigationItem = {
  label: string
  section: OperationSection | 'overview'
  icon: LucideIcon
  roles: string[]
  feature?: PlanFeatureKey
}

export const workspaceNavigation: WorkspaceNavigationItem[] = [
  { label: 'Overview', section: 'overview', icon: LayoutDashboard, roles: [] },
  { label: 'Staff & access', section: 'members', icon: UsersRound, roles: ['captain'] },
  { label: 'Barangay settings', section: 'barangay-settings', icon: Settings2, roles: ['captain'] },
  { label: 'Plans & subscription', section: 'tenant-subscription', icon: CircleDollarSign, roles: ['captain'] },
  { label: 'Residents & households', section: 'residents', icon: Users, roles: ['captain', 'secretary', 'resident'], feature: 'core_services' },
  { label: 'Official invitations', section: 'invitations', icon: UserPlus, roles: ['captain'] },
  { label: 'Document services', section: 'documents', icon: FileText, roles: ['captain', 'secretary', 'resident'], feature: 'core_services' },
  { label: 'Meetings & attendance', section: 'meetings', icon: CalendarDays, roles: ['captain', 'secretary', 'kagawad', 'resident'], feature: 'core_services' },
  { label: 'Announcements', section: 'announcements', icon: Bell, roles: ['captain', 'secretary', 'resident'], feature: 'core_services' },
  { label: 'Barangay archive', section: 'archive', icon: Archive, roles: ['captain', 'secretary'], feature: 'core_services' },
  { label: 'Budgets & finance', section: 'finance', icon: CircleDollarSign, roles: ['captain', 'treasurer'], feature: 'finance' },
  { label: 'Committees', section: 'committees', icon: UsersRound, roles: ['captain', 'secretary', 'kagawad'], feature: 'community_programs' },
  { label: 'Barangay projects', section: 'projects', icon: FolderKanban, roles: ['captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'], feature: 'community_programs' },
  { label: 'Inter-barangay referrals', section: 'referrals', icon: ArrowLeftRight, roles: ['captain', 'secretary'], feature: 'core_services' },
  { label: 'Health outreach', section: 'health-outreach', icon: HeartHandshake, roles: ['captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'], feature: 'community_programs' },
  { label: 'SK events & programs', section: 'sk-events', icon: CalendarDays, roles: ['captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'], feature: 'community_programs' },
  { label: 'Community calendar', section: 'community-calendar', icon: CalendarDays, roles: ['captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'], feature: 'community_programs' },
  { label: 'SK projects', section: 'sk-projects', icon: FileCheck2, roles: ['captain', 'sk_chairperson'], feature: 'community_programs' },
  { label: 'SK accomplishments', section: 'sk-accomplishments', icon: Award, roles: ['captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'], feature: 'community_programs' },
  { label: 'Incident reports', section: 'incidents', icon: AlertTriangle, roles: ['captain', 'tanod', 'resident'], feature: 'public_safety' },
  { label: 'Tanod patrols', section: 'patrols', icon: ClipboardList, roles: ['captain', 'tanod'], feature: 'public_safety' },
  { label: 'Disaster advisories', section: 'advisories', icon: Megaphone, roles: ['captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'], feature: 'public_safety' },
  { label: 'Community feedback', section: 'feedback', icon: MessageSquare, roles: ['captain', 'secretary', 'resident'], feature: 'core_services' },
  { label: 'Help & support', section: 'support', icon: Headset, roles: ['captain', 'secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident'] },
]

export function getVisibleWorkspaceNavigation(
  roleKey: string | undefined,
  enabledFeatures: Partial<Record<PlanFeatureKey, boolean>> | undefined,
  planFeaturesPending: boolean,
) {
  return workspaceNavigation.filter((item) =>
    (item.roles.length === 0 || item.roles.includes(roleKey ?? ''))
      && (!item.feature || planFeaturesPending || enabledFeatures?.[item.feature] === true),
  )
}
