import { lazy, Suspense, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Archive, ArrowLeft, ArrowRight, Bell, BookOpen, Building2, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, CircleHelp, ClipboardList, Clock3, FileCheck2, FileText, Headset, HeartHandshake, LayoutDashboard, LogOut, Megaphone, Menu, Search, ShieldCheck, UserPlus, Users, UsersRound, WalletCards, X } from 'lucide-react'
import { useAuth } from './auth/AuthProvider'
import { supabaseConfigured } from './lib/supabase'
import { AcceptInvitationPage } from './features/operations/AcceptInvitationPage'
import { AttendanceQrCheckInPage } from './features/operations/AttendanceQrCheckInPage'
import { OnboardingPage } from './features/operations/OnboardingPage'
import { OperationsSection, type OperationSection } from './features/operations/OperationsSection'
import { getWorkspaceDashboardMetrics } from './features/operations/data'
import { PlatformDirectory } from './features/operations/PlatformDirectory'
import { LandingPage } from './features/landing/LandingPage'

const PlatformSupportPage = lazy(() => import('./features/operations/SupportPage').then((module) => ({ default: module.SupportPage })))
const PlatformSubscriptionsPage = lazy(() => import('./features/operations/SubscriptionsPage').then((module) => ({ default: module.SubscriptionsPage })))

function SignIn() {
  const { user, signIn } = useAuth()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={next?.startsWith('/accept-invitation') || next?.startsWith('/attendance/check-in') ? next : '/'} replace />
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try { await signIn(email, password) } catch { setError('Sign-in failed. Check your details and try again.') } finally { setBusy(false) }
  }
  return <main className="auth-page">
    <div className="auth-brand"><div className="brand-mark"><HeartHandshake size={24} /></div><span>KABALIKAT</span></div>
    <section className="auth-card">
      <Link className="auth-back-link" to="/"><ArrowLeft size={16} /> Back to home</Link>
      <div className="eyebrow">YOUR COMMUNITY, CONNECTED</div><h1>Welcome back</h1>
      <p className="muted">Sign in with the account invited by your barangay.</p>
      {!supabaseConfigured && <div className="notice"><ShieldCheck size={18} /><span>Connect Supabase using the environment variables in <code>.env.example</code> to enable sign in.</span></div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      <form onSubmit={submit} className="form-stack">
        <label>Email address<input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /></label>
        <button className="button primary full" disabled={busy || !supabaseConfigured}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button>
      </form>
      <div className="auth-foot"><ShieldCheck size={15} />Secure access for authorized community members</div>
    </section>
    <p className="auth-caption">One Barangay. One Connected Community.</p>
  </main>
}

const nav: Array<{ label: string; section: OperationSection | 'overview'; icon: typeof LayoutDashboard; roles: string[] }> = [
  { label: 'Overview', section: 'overview', icon: LayoutDashboard, roles: [] },
  { label: 'Residents & households', section: 'residents', icon: Users, roles: ['captain','secretary','resident'] },
  { label: 'Official invitations', section: 'invitations', icon: UserPlus, roles: ['captain'] },
  { label: 'Document services', section: 'documents', icon: FileText, roles: ['captain','secretary','resident'] },
  { label: 'Meetings & attendance', section: 'meetings', icon: CalendarDays, roles: ['captain','secretary','kagawad','resident'] },
  { label: 'Announcements', section: 'announcements', icon: Bell, roles: ['captain','secretary','resident'] },
  { label: 'Barangay archive', section: 'archive', icon: Archive, roles: ['captain','secretary'] },
  { label: 'Budgets & finance', section: 'finance', icon: CircleDollarSign, roles: ['captain','treasurer'] },
  { label: 'Committees', section: 'committees', icon: UsersRound, roles: ['captain','secretary','kagawad'] },
  { label: 'SK projects', section: 'sk-projects', icon: FileCheck2, roles: ['captain','sk_chairperson'] },
  { label: 'Incident reports', section: 'incidents', icon: AlertTriangle, roles: ['captain','tanod','resident'] },
  { label: 'Tanod patrols', section: 'patrols', icon: ClipboardList, roles: ['captain','tanod'] },
  { label: 'Disaster advisories', section: 'advisories', icon: Megaphone, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
  { label: 'Help & support', section: 'support', icon: Headset, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
]

function PlatformWorkspace() {
  const { user, signOut } = useAuth()
  const [activePage, setActivePage] = useState<'overview' | 'onboarding' | 'support' | 'subscriptions'>('overview')
  const adminLinks = [
    { label: 'Platform overview', icon: LayoutDashboard, page: 'overview' as const },
    { label: 'Barangay onboarding', icon: Building2, page: 'onboarding' as const },
    { label: 'Support queue', icon: Headset, page: 'support' as const },
    { label: 'Subscriptions & plans', icon: CircleDollarSign, page: 'subscriptions' as const },
  ]
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={21} /></div><div><strong>KABALIKAT</strong><small>PLATFORM ADMIN</small></div></div>
      <div className="tenant-switch"><div className="tenant-icon"><ShieldCheck size={17} /></div><div className="tenant-copy"><span>ADMIN CONSOLE</span><strong>ArkByte Technologies</strong></div></div>
      <div className="nav-label">PLATFORM</div>
      <nav>{adminLinks.map(({ label, icon: Icon, page }) => <button key={label} className={`nav-link ${activePage === page ? 'active' : ''}`} onClick={() => setActivePage(page)}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="user-card"><div className="avatar">{user?.email?.[0]?.toUpperCase() ?? 'A'}</div><div className="user-details"><strong>{user?.email}</strong><span>Platform administrator</span></div><button className="icon-button" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={17} /></button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="crumb">Platform <span>/</span> {activePage === 'support' ? 'Support queue' : activePage === 'onboarding' ? 'Barangay onboarding' : activePage === 'subscriptions' ? 'Subscriptions & plans' : 'Overview'}</div><div className="top-actions"><div className="top-avatar">{user?.email?.[0]?.toUpperCase() ?? 'A'}</div></div></header>
      <div className="content-wrap">{activePage === 'onboarding' ? <OnboardingPage /> : activePage === 'support' ? <Suspense fallback={<div className="ops-loading" role="status">Loading support queue…</div>}><PlatformSupportPage platformAdmin /></Suspense> : activePage === 'subscriptions' ? <Suspense fallback={<div className="ops-loading" role="status">Loading subscriptions…</div>}><PlatformSubscriptionsPage /></Suspense> : <><div className="welcome-row"><div><div className="eyebrow">ARKBYTE TECHNOLOGIES</div><h1>Platform overview</h1><p>Manage KABALIKAT service operations from the platform workspace.</p></div><span className="role-pill">Platform administrator</span></div>
        <div className="setup-banner"><div className="setup-icon"><ShieldCheck size={21} /></div><div><strong>Platform access verified</strong><p>This account is listed in the protected platform administrator registry.</p></div></div>
        <div className="section-heading"><div><h2>Platform tools</h2><p>Administration modules planned for upcoming phases</p></div></div>
        <div className="module-grid"><div className="module-card"><div className="module-icon orange"><Activity size={20} /></div><div><strong>Plans & subscriptions</strong><p>Entitlements, trials, and billing history</p></div><span className="role-pill">PLANNED</span></div><div className="module-card"><div className="module-icon blue"><CircleHelp size={20} /></div><div><strong>Support requests</strong><p>Platform support and service notices</p></div><span className="role-pill">PLANNED</span></div><div className="module-card"><div className="module-icon violet"><ShieldCheck size={20} /></div><div><strong>Platform configuration</strong><p>System settings and feature flags</p></div><span className="role-pill">PLANNED</span></div></div>
        <PlatformDirectory />
        <section className="panel" style={{ marginTop: 20 }}><div className="panel-head"><div><h2>Privacy boundary</h2><p>Platform administration is separate from tenant records.</p></div><ShieldCheck size={19} /></div><p style={{ color: '#87958c', fontSize: 13, lineHeight: 1.65, marginTop: 17 }}>Platform administrators can see barangay names, locations, service status, and aggregate active membership counts. They cannot read private resident, health, document, meeting, or financial records through this directory.</p></section>
        <footer className="footer"><span>© 2026 KABALIKAT by ArkByte Technologies</span><span><ShieldCheck size={14} /> Platform access is audited at the database boundary</span></footer></>}
      </div>
    </main>
  </div>
}

function Workspace() {
  const { user, membership, loading, error, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<OperationSection | 'overview'>('overview')
  const dashboard = useQuery({ queryKey: ['workspace-dashboard', membership?.barangay_id], queryFn: () => getWorkspaceDashboardMetrics(membership!.barangay_id), enabled: Boolean(membership?.barangay_id && activeSection === 'overview'), staleTime: 60_000 })
  if (loading) return <div className="center-state"><span className="spinner" />Loading your secure workspace…</div>
  if (!user) return <Navigate to="/sign-in" replace />
  const barangay = membership?.barangay
  const visibleNav = nav.filter((item) => item.roles.length === 0 || item.roles.includes(membership?.role?.key ?? ''))
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><HeartHandshake size={21} /></div><div><strong>KABALIKAT</strong><small>BARANGAY SERVICES</small></div><button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      {barangay && <div className="tenant-switch"><div className="tenant-icon"><Building2 size={17} /></div><div className="tenant-copy"><span>ACTIVE BARANGAY</span><strong>{barangay.name}</strong></div><ChevronDown size={15} /></div>}
      <div className="nav-label">WORKSPACE</div>
      <nav>{visibleNav.map(({ label, section, icon: Icon }) => <button key={label} className={`nav-link ${activeSection === section ? 'active' : ''}`} aria-current={activeSection === section ? 'page' : undefined} onClick={() => { setActiveSection(section); setMenuOpen(false) }}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><a className="nav-link" href="#" onClick={(e) => e.preventDefault()}><CircleHelp size={18} /><span>Help & support</span></a><div className="user-card"><div className="avatar">{user.email?.[0]?.toUpperCase() ?? 'U'}</div><div className="user-details"><strong>{user.email?.split('@')[0]}</strong><span>{membership?.role?.label ?? 'No active membership'}</span></div><button className="icon-button" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={17} /></button></div></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="crumb">Workspace <span>/</span> Overview</div><div className="top-actions"><button className="search-control"><Search size={17} /><span>Search anything</span><kbd>⌘ K</kbd></button><button className="icon-button notification" aria-label="Notifications"><Bell size={19} /><i /></button><div className="top-avatar">{user.email?.[0]?.toUpperCase() ?? 'U'}</div></div></header>
      <div className="content-wrap">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!membership ? <section className="empty-state"><div className="empty-icon"><Building2 size={25} /></div><h1>No barangay workspace yet</h1><p>Your account is signed in, but it has no active barangay membership. Ask an authorized administrator to invite you. Access is granted only after that membership is provisioned.</p><div className="empty-foot"><ShieldCheck size={16} />Your account cannot select or change its own tenant.</div></section> : activeSection !== 'overview' ? <OperationsSection section={activeSection} /> : <>
          <div className="welcome-row"><div><div className="eyebrow">{barangay?.municipality}, {barangay?.province}</div><h1>Good day, {user.email?.split('@')[0]}</h1><p>Here’s what’s happening in your community today.</p></div><button className="button outline"><CalendarDays size={16} />Today <ChevronDown size={15} /></button></div>
          <div className="setup-banner"><div className="setup-icon"><CheckCircle2 size={21} /></div><div><strong>Your workspace overview is ready</strong><p>Counts below are limited to information your assigned role can access.</p></div></div>
          {dashboard.isPending && <div className="dashboard-metrics-loading" role="status">Loading your workspace summary…</div>}
          {dashboard.error && <div className="error-banner" role="alert">Unable to load the workspace summary. You can still open your available tools.</div>}
          {dashboard.data && <div className="dashboard-metrics" aria-label="Workspace summary">
            {dashboard.data.residents !== null && <button className="dashboard-metric" onClick={() => setActiveSection('residents')}><span className="dashboard-metric-icon green"><Users size={19} /></span><span><small>Active residents</small><strong>{dashboard.data.residents.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            {dashboard.data.pending_documents !== null && <button className="dashboard-metric" onClick={() => setActiveSection('documents')}><span className="dashboard-metric-icon orange"><FileText size={19} /></span><span><small>Documents to review</small><strong>{dashboard.data.pending_documents.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            {dashboard.data.upcoming_meetings !== null && <button className="dashboard-metric" onClick={() => setActiveSection('meetings')}><span className="dashboard-metric-icon blue"><Clock3 size={19} /></span><span><small>Upcoming meetings</small><strong>{dashboard.data.upcoming_meetings.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            {dashboard.data.pending_finance !== null && <button className="dashboard-metric" onClick={() => setActiveSection('finance')}><span className="dashboard-metric-icon violet"><WalletCards size={19} /></span><span><small>Finance entries to review</small><strong>{dashboard.data.pending_finance.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            {dashboard.data.published_announcements !== null && <button className="dashboard-metric" onClick={() => setActiveSection('announcements')}><span className="dashboard-metric-icon green"><Megaphone size={19} /></span><span><small>Current announcements</small><strong>{dashboard.data.published_announcements.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
          </div>}
          <div className="section-heading"><div><h2>Your workspace</h2><p>Tools available to your account</p></div><span className="role-pill">{membership.role?.label ?? 'Member'}</span></div>
          <div className="module-grid">{visibleNav.some((item) => item.section === 'residents') && <button className="module-card" onClick={() => setActiveSection('residents')}><div className="module-icon green"><Users size={20} /></div><div><strong>Resident records</strong><p>Permission-controlled resident services</p></div><ArrowRight size={17} className="module-arrow" /></button>}{visibleNav.some((item) => item.section === 'documents') && <button className="module-card" onClick={() => setActiveSection('documents')}><div className="module-icon orange"><FileText size={20} /></div><div><strong>Document services</strong><p>Requests, approvals, and releases</p></div><ArrowRight size={17} className="module-arrow" /></button>}{visibleNav.some((item) => item.section === 'meetings') && <button className="module-card" onClick={() => setActiveSection('meetings')}><div className="module-icon blue"><CalendarDays size={20} /></div><div><strong>Meetings & attendance</strong><p>Agendas and meeting records</p></div><ArrowRight size={17} className="module-arrow" /></button>}{visibleNav.some((item) => item.section === 'announcements') && <button className="module-card" onClick={() => setActiveSection('announcements')}><div className="module-icon violet"><Activity size={20} /></div><div><strong>Community updates</strong><p>Announcements and local notices</p></div><ArrowRight size={17} className="module-arrow" /></button>}{visibleNav.some((item) => item.section === 'archive') && <button className="module-card" onClick={() => setActiveSection('archive')}><div className="module-icon green"><Archive size={20} /></div><div><strong>Barangay archive</strong><p>Private files and searchable records</p></div><ArrowRight size={17} className="module-arrow" /></button>}</div>
          <div className="lower-grid"><section className="panel"><div className="panel-head"><div><h2>Getting started</h2><p>Your administrator will guide your setup</p></div><BookOpen size={19} /></div><div className="getting-started"><div className="step"><span className="step-number done"><CheckCircle2 size={15} /></span><div><strong>Secure account access</strong><p>You’re signed in with your invited account.</p></div><span className="complete-label">COMPLETE</span></div><div className="step"><span className="step-number">2</span><div><strong>Confirm your assigned role</strong><p>Contact your workspace administrator if it looks incorrect.</p></div></div><div className="step"><span className="step-number">3</span><div><strong>Explore your available tools</strong><p>Only features allowed for your role will be enabled.</p></div></div></div></section><section className="panel help-panel"><div className="help-art"><div className="help-orbit"><HeartHandshake size={30} /></div><span className="spark spark-a">✦</span><span className="spark spark-b">✳</span><span className="spark spark-c">✦</span></div><div className="help-copy"><div className="eyebrow">HERE TO HELP</div><h2>Building a stronger community, together.</h2><p>Need help accessing your workspace? Reach out to your barangay administrator.</p><a href="#" onClick={(e) => e.preventDefault()}>Learn about KABALIKAT <ArrowRight size={15} /></a></div></section></div>
        </>}
        <footer className="footer"><span>© 2026 KABALIKAT by ArkByte Technologies</span><span><ShieldCheck size={14} /> Private, secure community workspace</span></footer>
      </div>
    </main>
  </div>
}

export function App() {
  const { loading, isPlatformAdmin, user } = useAuth()
  if (loading) return <div className="center-state"><span className="spinner" />Loading KABALIKAT…</div>
  const home = isPlatformAdmin ? <Navigate to="/platform" replace /> : user ? <Workspace /> : <LandingPage />
  return <Routes><Route path="/" element={home} /><Route path="/sign-in" element={<SignIn />} /><Route path="/accept-invitation" element={<AcceptInvitationPage />} /><Route path="/attendance/check-in" element={<AttendanceQrCheckInPage />} /><Route path="/platform" element={isPlatformAdmin ? <PlatformWorkspace /> : <Navigate to="/" replace />} /><Route path="*" element={home} /></Routes>
}
