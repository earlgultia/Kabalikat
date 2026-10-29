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
const ProjectsPage = lazy(() => import('./ProjectsPage').then((module) => ({ default: module.ProjectsPage })))
const IncidentsPage = lazy(() => import('./IncidentsPage').then((module) => ({ default: module.IncidentsPage })))
const PatrolPage = lazy(() => import('./PatrolPage').then((module) => ({ default: module.PatrolPage })))
const DisasterAdvisoriesPage = lazy(() => import('./DisasterAdvisoriesPage').then((module) => ({ default: module.DisasterAdvisoriesPage })))
const SupportPage = lazy(() => import('./SupportPage').then((module) => ({ default: module.SupportPage })))

function page(component: ComponentType) {
  const Page = component
  return <Suspense fallback={<div className="ops-loading" role="status">Loading workspace…</div>}><Page /></Suspense>
}

export type OperationSection = 'residents' | 'invitations' | 'documents' | 'announcements' | 'meetings' | 'archive' | 'finance' | 'committees' | 'projects' | 'sk-projects' | 'incidents' | 'patrols' | 'advisories' | 'support'

export function OperationsSection({ section }: { section: OperationSection }) {
  switch (section) {
    case 'residents': return page(ResidentsPage)
    case 'invitations': return page(InvitationsPage)
    case 'documents': return page(DocumentsPage)
    case 'announcements': return page(AnnouncementsPage)
    case 'meetings': return page(MeetingsPage)
    case 'archive': return page(ArchivePage)
    case 'finance': return page(FinancePage)
    case 'committees': return page(CommitteesPage)
    case 'sk-projects': return page(SkProjectsPage)
    case 'projects': return page(ProjectsPage)
    case 'incidents': return page(IncidentsPage)
    case 'patrols': return page(PatrolPage)
    case 'advisories': return page(DisasterAdvisoriesPage)
    case 'support': return page(SupportPage)
  }
}

