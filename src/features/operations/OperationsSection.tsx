import { lazy, Suspense, type ComponentType } from 'react'
import './operations.css'

const ResidentsPage = lazy(() => import('./ResidentsPage').then((module) => ({ default: module.ResidentsPage })))
const InvitationsPage = lazy(() => import('./InvitationsPage').then((module) => ({ default: module.InvitationsPage })))
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

export type OperationSection = 'residents' | 'invitations' | 'documents' | 'announcements' | 'meetings' | 'archive' | 'finance' | 'committees' | 'projects' | 'referrals' | 'health-outreach' | 'sk-events' | 'sk-projects' | 'sk-accomplishments' | 'incidents' | 'patrols' | 'advisories' | 'community-calendar' | 'feedback' | 'support'

export function OperationsSection({ section, focusId, onFocusHandled }: { section: OperationSection; focusId?: string; onFocusHandled?: () => void }) {
  switch (section) {
    case 'residents': return page(ResidentsPage, { focusId, onFocusHandled })
    case 'invitations': return page(InvitationsPage)
    case 'documents': return page(DocumentsPage, { focusId, onFocusHandled })
    case 'announcements': return page(AnnouncementsPage, { focusId, onFocusHandled })
    case 'meetings': return page(MeetingsPage)
    case 'archive': return page(ArchivePage)
    case 'finance': return page(FinancePage)
    case 'committees': return page(CommitteesPage)
    case 'sk-projects': return page(SkProjectsPage)
    case 'sk-accomplishments': return page(SkTransparencyPage)
    case 'projects': return page(ProjectsPage)
    case 'referrals': return page(ReferralsPage)
    case 'health-outreach': return page(HealthOutreachPage)
    case 'sk-events': return page(SkEventsPage)
    case 'incidents': return page(IncidentsPage)
    case 'patrols': return page(PatrolPage)
    case 'advisories': return page(DisasterAdvisoriesPage, { focusId, onFocusHandled })
    case 'community-calendar': return page(CommunityCalendarPage)
    case 'feedback': return page(CommunityFeedbackPage, { focusId, onFocusHandled })
    case 'support': return page(SupportPage)
  }
}

