import { lazy, Suspense, type ComponentType } from 'react'
import './operations.css'

const ResidentsPage = lazy(() => import('./ResidentsPage').then((module) => ({ default: module.ResidentsPage })))
const InvitationsPage = lazy(() => import('./InvitationsPage').then((module) => ({ default: module.InvitationsPage })))
const MembersPage = lazy(() => import('./MembersPage').then((module) => ({ default: module.MembersPage })))
const BarangaySettingsPage = lazy(() => import('./BarangaySettingsPage').then((module) => ({ default: module.BarangaySettingsPage })))
const TenantSubscriptionPage = lazy(() => import('./TenantSubscriptionPage').then((module) => ({ default: module.TenantSubscriptionPage })))
const DocumentsPage = lazy(() => import('./DocumentsPage').then((module) => ({ default: module.DocumentsPage })))
const AnnouncementsPage = lazy(() => import('./AnnouncementsPage').then((module) => ({ default: module.AnnouncementsPage })))
const MeetingsPage = lazy(() => import('./MeetingsPage').then((module) => ({ default: module.MeetingsPage })))
const ArchivePage = lazy(() => import('./ArchivePage').then((module) => ({ default: module.ArchivePage })))
const FinancePage = lazy(() => import('./FinancePage').then((module) => ({ default: module.FinancePage })))
const CommitteesPage = lazy(() => import('./CommitteesPage').then((module) => ({ default: module.CommitteesPage })))
const SkProjectsPage = lazy(() => import('./SkProjectsPage').then((module) => ({ default: module.SkProjectsPage })))
const SkTransparencyPage = lazy(() => import('./SkTransparencyPage').then((module) => ({ default: module.SkTransparencyPage })))
const ProjectsPage = lazy(() => import('./ProjectsPage').then((module) => ({ default: module.ProjectsPage })))
const ReferralsPage = lazy(() => import('./ReferralsPage').then((module) => ({ default: module.ReferralsPage })))
const HealthOutreachPage = lazy(() => import('./HealthOutreachPage').then((module) => ({ default: module.HealthOutreachPage })))
const SkEventsPage = lazy(() => import('./SkEventsPage').then((module) => ({ default: module.SkEventsPage })))
const IncidentsPage = lazy(() => import('./IncidentsPage').then((module) => ({ default: module.IncidentsPage })))
const PatrolPage = lazy(() => import('./PatrolPage').then((module) => ({ default: module.PatrolPage })))
const DisasterAdvisoriesPage = lazy(() => import('./DisasterAdvisoriesPage').then((module) => ({ default: module.DisasterAdvisoriesPage })))
const CommunityCalendarPage = lazy(() => import('./CommunityCalendarPage').then((module) => ({ default: module.CommunityCalendarPage })))
const CommunityFeedbackPage = lazy(() => import('./CommunityFeedbackPage').then((module) => ({ default: module.CommunityFeedbackPage })))
const SupportPage = lazy(() => import('./SupportPage').then((module) => ({ default: module.SupportPage })))

function page<Props extends object>(component: ComponentType<Props>, props?: Props) {
  const Page = component
  return <Suspense fallback={<div className="ops-loading" role="status">Loading workspace…</div>}><Page {...(props ?? {} as Props)} /></Suspense>
}

export type OperationSection = 'members' | 'barangay-settings' | 'tenant-subscription' | 'residents' | 'invitations' | 'documents' | 'announcements' | 'meetings' | 'archive' | 'finance' | 'committees' | 'projects' | 'referrals' | 'health-outreach' | 'sk-events' | 'sk-projects' | 'sk-accomplishments' | 'incidents' | 'patrols' | 'advisories' | 'community-calendar' | 'feedback' | 'support'

export function OperationsSection({ section, focusId, focusPage, focusStatus, focusSkEventOwnDrafts, focusSkEventOwnChangesRequested, focusUpcomingHealthOutreach, focusUpcomingMeetings, focusHealthOutreachMine, focusAssignedActive, focusResidentOpenIncidents, focusResidentActiveDocuments, focusPatrolStatus, focusOwnCorrections, focusResidentProfile, focusActiveResidents, focusUpcomingSkEvents, focusCurrentAnnouncements, focusOpenSupportRequests, focusFeedbackAwaitingResponse, focusResidentReviewQueue, focusDocumentReviewQueue, focusInvitationReviewQueue, focusDueDateRequestStatus, focusDueDateReviewQueue, focusMeetingRecords, focusRsvpNeeded, focusMeetingInvitations, focusMeetingAttendance, focusTaskFilter, focusSkAccomplishmentReviewQueue, focusSkProjectStatus, focusSkProjectReviewQueue, focusReturnedSkAccomplishment, focusReferralNeedsAction, focusFinanceQueue, focusRelatedId, focusRelatedPage, focusNestedPage, focusOpenResponses, focusCorrectionRequestId, focusCorrectionPage, focusCorrectionQueue, onFocusHandled, onOpenInvitations }: { section: OperationSection; focusId?: string; focusPage?: number; focusStatus?: 'draft' | 'changes_requested' | 'review_queue' | 'published' | 'cancelled' | 'completed'; focusSkEventOwnDrafts?: boolean; focusSkEventOwnChangesRequested?: boolean; focusUpcomingHealthOutreach?: boolean; focusUpcomingMeetings?: boolean; focusHealthOutreachMine?: boolean; focusAssignedActive?: boolean; focusResidentOpenIncidents?: boolean; focusResidentActiveDocuments?: boolean; focusPatrolStatus?: 'scheduled' | 'active'; focusOwnCorrections?: boolean; focusResidentProfile?: boolean; focusActiveResidents?: boolean; focusUpcomingSkEvents?: boolean; focusCurrentAnnouncements?: boolean; focusOpenSupportRequests?: boolean; focusFeedbackAwaitingResponse?: boolean; focusResidentReviewQueue?: 'residency' | 'profile-corrections'; focusDocumentReviewQueue?: boolean; focusInvitationReviewQueue?: boolean; focusDueDateRequestStatus?: 'pending' | 'reviewed' | 'reviewed_last_30_days'; focusDueDateReviewQueue?: boolean; focusMeetingRecords?: 'minutes' | 'resolutions'; focusRsvpNeeded?: boolean; focusMeetingInvitations?: 'upcoming' | 'check_in'; focusMeetingAttendance?: 'present' | 'absent' | 'excused'; focusTaskFilter?: 'open' | 'in_progress' | 'blocked' | 'overdue' | 'due_soon' | 'completed_work'; focusSkAccomplishmentReviewQueue?: 'all' | 'mine' | 'captain'; focusSkProjectStatus?: 'submitted' | 'approved' | 'rejected' | 'active' | 'completed' | 'all' | 'open' | 'my_submitted'; focusSkProjectReviewQueue?: boolean; focusReturnedSkAccomplishment?: boolean; focusReferralNeedsAction?: boolean; focusFinanceQueue?: 'budgets' | 'transactions' | 'budget_changes' | 'transaction_changes' | 'captain_review'; focusRelatedId?: string; focusRelatedPage?: number; focusNestedPage?: number; focusOpenResponses?: boolean; focusCorrectionRequestId?: string; focusCorrectionPage?: number; focusCorrectionQueue?: boolean; onFocusHandled?: () => void; onOpenInvitations?: () => void }) {
  switch (section) {
    case 'members': return page(MembersPage, { onOpenInvitations })
    case 'barangay-settings': return page(BarangaySettingsPage)
    case 'tenant-subscription': return page(TenantSubscriptionPage)
    case 'residents': return page(ResidentsPage, { focusId, focusOwnCorrections, focusResidentProfile, focusActiveResidents, focusReviewQueue: focusResidentReviewQueue, onFocusHandled })
    case 'invitations': return page(InvitationsPage, { focusPending: focusInvitationReviewQueue, onFocusHandled })
    case 'documents': return page(DocumentsPage, { focusId, focusReviewQueue: focusDocumentReviewQueue, focusActiveRequests: focusResidentActiveDocuments, onFocusHandled })
    case 'announcements': return page(AnnouncementsPage, { focusId, focusCurrent: focusCurrentAnnouncements, onFocusHandled })
    case 'meetings': return page(MeetingsPage, { focusId, focusPage, focusCorrectionRequestId, focusCorrectionPage, focusCorrectionQueue, focusUpcomingMeetings, focusMeetingRecords, focusRsvpNeeded, focusMeetingInvitations, focusMeetingAttendance, onFocusHandled })
    case 'archive': return page(ArchivePage)
    case 'finance': return page(FinancePage, { focusQueue: focusFinanceQueue, onFocusHandled })
    case 'committees': return page(CommitteesPage, { focusId, focusDueDateRequestStatus, focusDueDateReviewQueue, focusTaskFilter, onFocusHandled })
    case 'sk-projects': return page(SkProjectsPage, { focusStatus: focusSkProjectStatus, focusReviewQueue: focusSkProjectReviewQueue, focusReturnedAccomplishment: focusReturnedSkAccomplishment, onFocusHandled })
    case 'sk-accomplishments': return page(SkTransparencyPage, { focusReviewQueue: focusSkAccomplishmentReviewQueue, onFocusHandled })
    case 'projects': return page(ProjectsPage, { focusProjectId: focusId, focusProjectPage: focusPage, focusUpdateId: focusRelatedId, focusUpdatePage: focusRelatedPage, focusResponsePage: focusNestedPage, openResponseThread: focusOpenResponses, onFocusHandled })
    case 'referrals': return page(ReferralsPage, { focusNeedsAction: focusReferralNeedsAction, onFocusHandled })
    case 'health-outreach': return page(HealthOutreachPage, { focusId, focusPage, focusStatus, focusUpcoming: focusUpcomingHealthOutreach, focusMine: focusHealthOutreachMine, onFocusHandled })
    case 'sk-events': return page(SkEventsPage, { focusId, focusPage, focusStatus: focusStatus as 'draft' | 'changes_requested' | 'review_queue' | 'published' | 'completed' | 'cancelled' | undefined, focusMyDrafts: focusSkEventOwnDrafts, focusMyChangesRequested: focusSkEventOwnChangesRequested, focusUpcomingEvents: focusUpcomingSkEvents, onFocusHandled })
    case 'incidents': return page(IncidentsPage, { focusId, focusAssignedActive, focusOpenReports: focusResidentOpenIncidents, onFocusHandled })
    case 'patrols': return page(PatrolPage, { focusId, focusStatus: focusPatrolStatus, onFocusHandled })
    case 'advisories': return page(DisasterAdvisoriesPage, { focusId, onFocusHandled })
    case 'community-calendar': return page(CommunityCalendarPage)
    case 'feedback': return page(CommunityFeedbackPage, { focusId, focusAwaitingResponse: focusFeedbackAwaitingResponse, onFocusHandled })
    case 'support': return page(SupportPage, { focusId, focusOpenRequests: focusOpenSupportRequests, onFocusHandled })
  }
}

