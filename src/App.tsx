import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Archive, ArrowLeft, ArrowLeftRight, ArrowRight, Award, Bell, BookOpen, Building2, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, CircleHelp, ClipboardList, Clock3, FileCheck2, FileText, FolderKanban, Headset, HeartHandshake, LayoutDashboard, LogOut, Megaphone, Menu, Search, ShieldCheck, UserPlus, Users, UsersRound, WalletCards, X } from 'lucide-react'
import { useAuth } from './auth/AuthProvider'
import { supabase, supabaseConfigured } from './lib/supabase'
import { AcceptInvitationPage } from './features/operations/AcceptInvitationPage'
import { AccountSecurityDialog } from './features/operations/AccountSecurityDialog'
import { PasswordRecoveryPage } from './features/operations/PasswordRecoveryPage'
import { AttendanceQrCheckInPage } from './features/operations/AttendanceQrCheckInPage'
import { PublicDocumentVerificationPage } from './features/operations/PublicDocumentVerificationPage'
import { OnboardingPage } from './features/operations/OnboardingPage'
import { OperationsSection, type OperationSection } from './features/operations/OperationsSection'
import { getWorkspaceDashboardMetrics, listAnnouncements } from './features/operations/data'
import { listDisasterAdvisories } from './features/operations/disaster-data'
import { listCommunityNotifications, markAllCommunityNotificationsRead, markCommunityNotificationRead } from './features/operations/notifications-data'
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
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={next?.startsWith('/accept-invitation') || next?.startsWith('/attendance/check-in') ? next : '/'} replace />
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try { await signIn(email, password) } catch { setError('Sign-in failed. Check your details and try again.') } finally { setBusy(false) }
  }
  async function requestPasswordReset() {
    setError(''); setRecoveryMessage('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter your email address above, then request a reset link.'); return }
    if (!supabase) { setError('Password recovery is unavailable because Supabase is not configured.'); return }
    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
      if (resetError) throw resetError
      setRecoveryMessage('If an account matches that email, a password reset link will be sent. Check your inbox.')
    } catch { setError('We could not start password recovery. Check the Supabase Auth email and redirect settings, then try again.') }
    finally { setBusy(false) }
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
      <button type="button" className="auth-text-button" onClick={() => void requestPasswordReset()} disabled={busy || !supabaseConfigured}>Forgot password?</button>
      {recoveryMessage && <div className="notice recovery-inline" role="status"><ShieldCheck size={17} />{recoveryMessage}</div>}
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
  { label: 'Barangay projects', section: 'projects', icon: FolderKanban, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
  { label: 'Inter-barangay referrals', section: 'referrals', icon: ArrowLeftRight, roles: ['captain','secretary'] },
  { label: 'Health outreach', section: 'health-outreach', icon: HeartHandshake, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
  { label: 'SK events & programs', section: 'sk-events', icon: CalendarDays, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
  { label: 'SK projects', section: 'sk-projects', icon: FileCheck2, roles: ['captain','sk_chairperson'] },
  { label: 'SK accomplishments', section: 'sk-accomplishments', icon: Award, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
  { label: 'Incident reports', section: 'incidents', icon: AlertTriangle, roles: ['captain','tanod','resident'] },
  { label: 'Tanod patrols', section: 'patrols', icon: ClipboardList, roles: ['captain','tanod'] },
  { label: 'Disaster advisories', section: 'advisories', icon: Megaphone, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
  { label: 'Help & support', section: 'support', icon: Headset, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
]

function PlatformWorkspace() {
  const { user, signOut } = useAuth()
  const [activePage, setActivePage] = useState<'overview' | 'onboarding' | 'support' | 'subscriptions'>('overview')
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false)
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
    <main className="main-area"><header className="topbar"><div className="crumb">Platform <span>/</span> {activePage === 'support' ? 'Support queue' : activePage === 'onboarding' ? 'Barangay onboarding' : activePage === 'subscriptions' ? 'Subscriptions & plans' : 'Overview'}</div><div className="top-actions"><button type="button" className="top-avatar account-avatar" onClick={() => setAccountSecurityOpen(true)} aria-label="Open account security">{user?.email?.[0]?.toUpperCase() ?? 'A'}</button></div></header>
      <div className="content-wrap">{activePage === 'onboarding' ? <OnboardingPage /> : activePage === 'support' ? <Suspense fallback={<div className="ops-loading" role="status">Loading support queue…</div>}><PlatformSupportPage platformAdmin /></Suspense> : activePage === 'subscriptions' ? <Suspense fallback={<div className="ops-loading" role="status">Loading subscriptions…</div>}><PlatformSubscriptionsPage /></Suspense> : <><div className="welcome-row"><div><div className="eyebrow">ARKBYTE TECHNOLOGIES</div><h1>Platform overview</h1><p>Manage KABALIKAT service operations from the platform workspace.</p></div><span className="role-pill">Platform administrator</span></div>
        <div className="setup-banner"><div className="setup-icon"><ShieldCheck size={21} /></div><div><strong>Platform access verified</strong><p>This account is listed in the protected platform administrator registry.</p></div></div>
        <div className="section-heading"><div><h2>Platform tools</h2><p>Administration modules planned for upcoming phases</p></div></div>
        <div className="module-grid"><div className="module-card"><div className="module-icon orange"><Activity size={20} /></div><div><strong>Plans & subscriptions</strong><p>Entitlements, trials, and billing history</p></div><span className="role-pill">PLANNED</span></div><div className="module-card"><div className="module-icon blue"><CircleHelp size={20} /></div><div><strong>Support requests</strong><p>Platform support and service notices</p></div><span className="role-pill">PLANNED</span></div><div className="module-card"><div className="module-icon violet"><ShieldCheck size={20} /></div><div><strong>Platform configuration</strong><p>System settings and feature flags</p></div><span className="role-pill">PLANNED</span></div></div>
        <PlatformDirectory />
        <section className="panel" style={{ marginTop: 20 }}><div className="panel-head"><div><h2>Privacy boundary</h2><p>Platform administration is separate from tenant records.</p></div><ShieldCheck size={19} /></div><p style={{ color: '#87958c', fontSize: 13, lineHeight: 1.65, marginTop: 17 }}>Platform administrators can see barangay names, locations, service status, and aggregate active membership counts. They cannot read private resident, health, document, meeting, or financial records through this directory.</p></section>
        <footer className="footer"><span>© 2026 KABALIKAT by ArkByte Technologies</span><span><ShieldCheck size={14} /> Platform access is audited at the database boundary</span></footer></>}
      </div>
    </main>
    {accountSecurityOpen && <AccountSecurityDialog email={user?.email ?? ''} userId={user?.id ?? ''} tenantId={null} onClose={() => setAccountSecurityOpen(false)} />}
  </div>
}

function Workspace() {
  const { user, membership, memberships, switchMembership, loading, error, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<OperationSection | 'overview'>('overview')
  const [toolFinderOpen, setToolFinderOpen] = useState(false)
  const [toolQuery, setToolQuery] = useState('')
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false)
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [notificationActionError, setNotificationActionError] = useState('')
  const dashboard = useQuery({ queryKey: ['workspace-dashboard', membership?.barangay_id], queryFn: () => getWorkspaceDashboardMetrics(membership!.barangay_id), enabled: Boolean(membership?.barangay_id && activeSection === 'overview'), staleTime: 60_000 })
  const notifications = useQuery({ queryKey: ['community-notifications', membership?.barangay_id], queryFn: () => listCommunityNotifications(membership!.barangay_id), enabled: Boolean(membership?.barangay_id), staleTime: 20_000, refetchInterval: 60_000, refetchIntervalInBackground: false })
  const announcements = useQuery({ queryKey: ['workspace-updates-announcements', membership?.barangay_id], queryFn: () => listAnnouncements(membership!.barangay_id), enabled: Boolean(updatesOpen && membership?.barangay_id), staleTime: 60_000 })
  const advisories = useQuery({ queryKey: ['workspace-updates-advisories', membership?.barangay_id], queryFn: () => listDisasterAdvisories(membership!.barangay_id), enabled: Boolean(updatesOpen && membership?.barangay_id), staleTime: 60_000 })
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setToolFinderOpen(true)
      } else if (event.key === 'Escape') { setToolFinderOpen(false); setToolQuery(''); setUpdatesOpen(false); setWorkspacePickerOpen(false) }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])
  if (loading) return <div className="center-state"><span className="spinner" />Loading your secure workspace…</div>
  if (!user) return <Navigate to="/sign-in" replace />
  const barangay = membership?.barangay
  const visibleNav = nav.filter((item) => item.roles.length === 0 || item.roles.includes(membership?.role?.key ?? ''))
  const filteredTools = visibleNav.filter((item) => item.label.toLocaleLowerCase().includes(toolQuery.trim().toLocaleLowerCase()))
  const currentUpdates = [
    ...(announcements.data ?? []).filter((item) => item.status === 'published' && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()))
      .map((item) => ({ id: item.id, title: item.title, kind: 'Announcement', resourceType: 'announcement' as const, timestamp: item.published_at ?? item.created_at, section: 'announcements' as const })),
    ...(advisories.data ?? []).filter((item) => item.status === 'published' && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()))
      .map((item) => ({ id: item.id, title: item.title, kind: 'Disaster advisory', resourceType: 'disaster_advisory' as const, timestamp: item.published_at ?? item.created_at, section: 'advisories' as const })),
    ...(notifications.data ?? []).filter((item) => item.resource_type === 'resident_profile_change')
      .map((item) => ({ id: item.resource_id, title: 'A decision is available for your profile correction request', kind: 'Profile request', resourceType: 'resident_profile_change' as const, timestamp: item.created_at, section: 'residents' as const })),
    ...(notifications.data ?? []).filter((item) => item.resource_type === 'document_request')
      .map((item) => ({ id: item.resource_id, title: 'Your document request status has changed', kind: 'Document request', resourceType: 'document_request' as const, timestamp: item.created_at, section: 'documents' as const })),
  ].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()).slice(0, 100)
  const unreadNotifications = (notifications.data ?? []).filter((item) => !item.read_at)
  async function openCommunityUpdate(item: (typeof currentUpdates)[number]) {
    setNotificationActionError('')
    const notification = notifications.data?.find((entry) => entry.resource_type === item.resourceType && entry.resource_id === item.id && !entry.read_at)
    if (notification && membership?.barangay_id) {
      try {
        await markCommunityNotificationRead(notification.id, membership.barangay_id)
        await notifications.refetch()
      } catch { setNotificationActionError('This update was opened, but its read status could not be saved.') }
    }
    openTool(item.section)
  }
  async function markAllCommunityUpdatesRead() {
    if (!membership?.barangay_id) return
    setNotificationActionError('')
    try {
      await markAllCommunityNotificationsRead(membership.barangay_id)
      await notifications.refetch()
    } catch { setNotificationActionError('Unable to mark updates as read. Please try again.') }
  }
  function openTool(section: OperationSection | 'overview') {
    setActiveSection(section); setMenuOpen(false); setToolFinderOpen(false); setToolQuery(''); setUpdatesOpen(false)
  }
  function closeToolFinder() { setToolFinderOpen(false); setToolQuery('') }
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><HeartHandshake size={21} /></div><div><strong>KABALIKAT</strong><small>BARANGAY SERVICES</small></div><button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      {barangay && <div className="workspace-picker"><button type="button" className="tenant-switch" aria-expanded={workspacePickerOpen} aria-controls="workspace-picker-options" disabled={memberships.length < 2} onClick={() => setWorkspacePickerOpen((open) => !open)}><div className="tenant-icon"><Building2 size={17} /></div><div className="tenant-copy"><span>ACTIVE BARANGAY</span><strong>{barangay.name}</strong><small>{barangay.municipality}, {barangay.province}</small></div>{memberships.length > 1 && <ChevronDown size={15} />}</button>{workspacePickerOpen && memberships.length > 1 && <div className="workspace-picker-menu" id="workspace-picker-options"><p>Choose an authorized barangay</p>{memberships.map((item) => <button key={item.id} type="button" aria-current={item.id === membership?.id ? 'true' : undefined} onClick={() => { switchMembership(item.id); setWorkspacePickerOpen(false); setActiveSection('overview'); setMenuOpen(false) }}><Building2 size={16} /><span><strong>{item.barangay?.name}</strong><small>{item.role?.label} · {item.barangay?.municipality}</small></span>{item.id === membership?.id && <CheckCircle2 size={15} />}</button>)}</div>}</div>}
      <div className="nav-label">WORKSPACE</div>
      <nav>{visibleNav.map(({ label, section, icon: Icon }) => <button key={label} className={`nav-link ${activeSection === section ? 'active' : ''}`} aria-current={activeSection === section ? 'page' : undefined} onClick={() => { setActiveSection(section); setMenuOpen(false) }}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-link" type="button" onClick={() => openTool('support')}><CircleHelp size={18} /><span>Help & support</span></button><div className="user-card"><div className="avatar">{user.email?.[0]?.toUpperCase() ?? 'U'}</div><div className="user-details"><strong>{user.email?.split('@')[0]}</strong><span>{membership?.role?.label ?? 'No active membership'}</span></div><button className="icon-button" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={17} /></button></div></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="crumb">Workspace <span>/</span> {nav.find((item) => item.section === activeSection)?.label ?? 'Overview'}</div><div className="top-actions"><button className="search-control" onClick={() => setToolFinderOpen(true)} aria-label="Find a workspace tool"><Search size={17} /><span>Find a tool</span><kbd>Ctrl K</kbd></button><button className="icon-button search-control-mobile" onClick={() => setToolFinderOpen(true)} aria-label="Find a workspace tool"><Search size={18} /></button><button className="icon-button notification" aria-label={unreadNotifications.length ? `Open community updates, ${unreadNotifications.length} unread` : 'Open community updates'} aria-haspopup="dialog" onClick={() => setUpdatesOpen(true)} disabled={!membership}><Bell size={19} />{unreadNotifications.length > 0 && <span className="notification-badge" aria-hidden="true">{unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}</span>}</button><button type="button" className="top-avatar account-avatar" onClick={() => setAccountSecurityOpen(true)} aria-label="Open account security">{user.email?.[0]?.toUpperCase() ?? 'U'}</button></div></header>
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
          <div className="lower-grid"><section className="panel"><div className="panel-head"><div><h2>Getting started</h2><p>Your administrator will guide your setup</p></div><BookOpen size={19} /></div><div className="getting-started"><div className="step"><span className="step-number done"><CheckCircle2 size={15} /></span><div><strong>Secure account access</strong><p>You’re signed in with your invited account.</p></div><span className="complete-label">COMPLETE</span></div><div className="step"><span className="step-number">2</span><div><strong>Confirm your assigned role</strong><p>Contact your workspace administrator if it looks incorrect.</p></div></div><div className="step"><span className="step-number">3</span><div><strong>Explore your available tools</strong><p>Only features allowed for your role will be enabled.</p></div></div></div></section><section className="panel help-panel"><div className="help-art"><div className="help-orbit"><HeartHandshake size={30} /></div><span className="spark spark-a">✦</span><span className="spark spark-b">✳</span><span className="spark spark-c">✦</span></div><div className="help-copy"><div className="eyebrow">HERE TO HELP</div><h2>Building a stronger community, together.</h2><p>Need help accessing your workspace? Reach out to your barangay administrator.</p><button type="button" className="help-link" onClick={() => openTool('support')}>Open help & support <ArrowRight size={15} /></button></div></section></div>
        </>}
        <footer className="footer"><span>© 2026 KABALIKAT by ArkByte Technologies</span><span><ShieldCheck size={14} /> Private, secure community workspace</span></footer>
      </div>
    </main>
    {updatesOpen && <div className="tool-finder-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setUpdatesOpen(false) }}><section className="community-updates-dialog" role="dialog" aria-modal="true" aria-labelledby="community-updates-title" onKeyDown={(event) => { if (event.key === 'Tab') { const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])'); const first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() } } }}><header><div className="account-security-icon"><Bell size={19} /></div><div><h2 id="community-updates-title">Community updates</h2><p>Announcements, disaster advisories, and resident service decisions.</p></div>{unreadNotifications.length > 0 && <button type="button" className="mark-updates-read" onClick={() => void markAllCommunityUpdatesRead()}>Mark all read</button>}<button autoFocus type="button" className="icon-button" aria-label="Close community updates" onClick={() => setUpdatesOpen(false)}><X size={17} /></button></header>{notificationActionError && <div className="account-security-error updates-error" role="alert">{notificationActionError}</div>}{(announcements.isPending || advisories.isPending || notifications.isPending) && <div className="ops-loading" role="status">Loading updates…</div>}{(announcements.error || advisories.error || notifications.error) && <div className="account-security-error updates-error" role="alert">Some updates could not be loaded. Access remains controlled by your barangay permissions.</div>}{!announcements.isPending && !advisories.isPending && !notifications.isPending && currentUpdates.length === 0 && <div className="tool-finder-empty updates-empty">No current updates or service decisions.</div>}{currentUpdates.length > 0 && <div className="community-updates-list">{currentUpdates.map((item) => { const notification = notifications.data?.find((entry) => entry.resource_type === item.resourceType && entry.resource_id === item.id); const unread = Boolean(notification && !notification.read_at); return <button type="button" className={`community-update-item ${unread ? 'unread' : ''}`} key={`${item.kind}-${item.id}`} onClick={() => void openCommunityUpdate(item)}><span className="community-update-type">{item.kind}{unread && <span className="community-update-new">NEW</span>}</span><strong>{item.title}</strong><time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time></button>})}</div>}<p className="tool-finder-note">Only published information visible to your role is shown. External email and SMS delivery are not configured.</p></section></div>}
    {toolFinderOpen && <div className="tool-finder-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeToolFinder() }}><section className="tool-finder" role="dialog" aria-modal="true" aria-labelledby="tool-finder-title" onKeyDown={(event) => { if (event.key === 'Tab') { const focusable = event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])'); const first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() } } }}><div className="tool-finder-search"><Search size={19} /><input autoFocus value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && filteredTools[0]) openTool(filteredTools[0].section) }} placeholder="Find a workspace tool…" aria-label="Search available workspace tools" /><kbd>ESC</kbd><button type="button" className="icon-button" aria-label="Close tool finder" onClick={closeToolFinder}><X size={17} /></button></div><div className="tool-finder-results"><h2 id="tool-finder-title">Available tools</h2>{filteredTools.length ? filteredTools.map(({ label, section, icon: Icon }) => <button key={label} type="button" className="tool-finder-item" onClick={() => openTool(section)}><Icon size={18} /><span>{label}</span><ArrowRight size={15} /></button>) : <p className="tool-finder-empty">No matching tools are available for your account.</p>}</div><p className="tool-finder-note">Only tools available to your assigned role are listed.</p></section></div>}
    {accountSecurityOpen && <AccountSecurityDialog email={user.email ?? ''} userId={user.id} tenantId={membership?.barangay_id ?? null} onClose={() => setAccountSecurityOpen(false)} />}
  </div>
}

export function App() {
  const { loading, isPlatformAdmin, user } = useAuth()
  if (loading) return <div className="center-state"><span className="spinner" />Loading KABALIKAT…</div>
  const home = isPlatformAdmin ? <Navigate to="/platform" replace /> : user ? <Workspace /> : <LandingPage />
  return <Routes><Route path="/" element={home} /><Route path="/sign-in" element={<SignIn />} /><Route path="/reset-password" element={<PasswordRecoveryPage />} /><Route path="/accept-invitation" element={<AcceptInvitationPage />} /><Route path="/attendance/check-in" element={<AttendanceQrCheckInPage />} /><Route path="/verify-document" element={<PublicDocumentVerificationPage />} /><Route path="/platform" element={isPlatformAdmin ? <PlatformWorkspace /> : <Navigate to="/" replace />} /><Route path="*" element={home} /></Routes>
}
