import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Archive, ArrowLeft, ArrowLeftRight, ArrowRight, Award, Bell, BookOpen, Building2, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList, Clock3, Eye, EyeOff, FileCheck2, FileText, FolderKanban, Headset, HeartHandshake, LayoutDashboard, LogOut, Megaphone, Menu, MessageSquare, Search, Settings2, ShieldCheck, UserPlus, Users, UsersRound, WalletCards, X } from 'lucide-react'
import { useAuth } from './auth/AuthProvider'
import { supabase, supabaseConfigured } from './lib/supabase'
import { useModalFocus } from './lib/useModalFocus'
import { AcceptInvitationPage } from './features/operations/AcceptInvitationPage'
import { AccountSecurityDialog } from './features/operations/AccountSecurityDialog'
import { LogoutConfirmationDialog } from './components/LogoutConfirmationDialog'
import { PasswordRecoveryPage } from './features/operations/PasswordRecoveryPage'
import { AttendanceQrCheckInPage } from './features/operations/AttendanceQrCheckInPage'
import { PublicDocumentVerificationPage } from './features/operations/PublicDocumentVerificationPage'
import { OnboardingPage } from './features/operations/OnboardingPage'
import { OperationsSection, type OperationSection } from './features/operations/OperationsSection'
import { getCaptainReviewQueueSummary, getSecretaryReviewQueueSummary, getTreasurerFollowUpSummary, getKagawadActionItemSummary, getOwnAccountDisplayName, getWorkspaceDashboardMetrics, listRecentAnnouncements } from './features/operations/data'
import { listRecentDisasterAdvisories } from './features/operations/disaster-data'
import { countUnreadCommunityNotifications, listCommunityNotificationPage, listHealthOutreachRescheduleDetails, listHealthOutreachReviewDetails, listHealthOutreachReviewSubmissionDetails, listHealthOutreachUpdateDetails, listMeetingResolutionNotificationDetails, listMeetingUpdateNotificationDetails, listSkEventCancellationDetails, listSkEventCompletionDetails, listSkEventPublicationDetails, listSkEventRescheduleDetails, listSkEventReviewFeedbackDetails, listSkEventReviewSubmissionDetails, markAllCommunityNotificationsRead, markCommunityNotificationRead } from './features/operations/notifications-data'
import { PlatformDirectory } from './features/operations/PlatformDirectory'
import { getBarangayPlanFeatures, getSubscriptionSummary } from './features/operations/subscriptions-data'
import { listUpcomingCommunityEvents } from './features/operations/community-calendar-data'
import { LandingPage } from './features/landing/LandingPage'

const PlatformSupportPage = lazy(() => import('./features/operations/SupportPage').then((module) => ({ default: module.SupportPage })))
const PlatformSubscriptionsPage = lazy(() => import('./features/operations/SubscriptionsPage').then((module) => ({ default: module.SubscriptionsPage })))
const PlatformActivityPage = lazy(() => import('./features/operations/PlatformActivityPage').then((module) => ({ default: module.PlatformActivityPage })))

function SignIn() {
  const { user, signIn } = useAuth()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
        <label>Password<div className="auth-password-field"><input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <button className="button primary full" disabled={busy || !supabaseConfigured}>{busy ? 'Signing in...' : 'Sign in'}<ArrowRight size={17} /></button>
      </form>
      <button type="button" className="auth-text-button" onClick={() => void requestPasswordReset()} disabled={busy || !supabaseConfigured}>Forgot password?</button>
      {recoveryMessage && <div className="notice recovery-inline" role="status"><ShieldCheck size={17} />{recoveryMessage}</div>}
      <div className="auth-foot"><ShieldCheck size={15} />Secure access for authorized community members</div>
    </section>
    <p className="auth-caption">One Barangay. One Connected Community.</p>
  </main>
}

type PlanFeatureKey = 'core_services' | 'finance' | 'community_programs' | 'public_safety'
const nav: Array<{ label: string; section: OperationSection | 'overview'; icon: typeof LayoutDashboard; roles: string[]; feature?: PlanFeatureKey }> = [
  { label: 'Overview', section: 'overview', icon: LayoutDashboard, roles: [] },
  { label: 'Staff & access', section: 'members', icon: UsersRound, roles: ['captain'] },
  { label: 'Barangay settings', section: 'barangay-settings', icon: Settings2, roles: ['captain'] },
  { label: 'Plans & subscription', section: 'tenant-subscription', icon: CircleDollarSign, roles: ['captain'] },
  { label: 'Residents & households', section: 'residents', icon: Users, roles: ['captain','secretary','resident'], feature: 'core_services' },
  { label: 'Official invitations', section: 'invitations', icon: UserPlus, roles: ['captain'] },
  { label: 'Document services', section: 'documents', icon: FileText, roles: ['captain','secretary','resident'], feature: 'core_services' },
  { label: 'Meetings & attendance', section: 'meetings', icon: CalendarDays, roles: ['captain','secretary','kagawad','resident'], feature: 'core_services' },
  { label: 'Announcements', section: 'announcements', icon: Bell, roles: ['captain','secretary','resident'], feature: 'core_services' },
  { label: 'Barangay archive', section: 'archive', icon: Archive, roles: ['captain','secretary'], feature: 'core_services' },
  { label: 'Budgets & finance', section: 'finance', icon: CircleDollarSign, roles: ['captain','treasurer'], feature: 'finance' },
  { label: 'Committees', section: 'committees', icon: UsersRound, roles: ['captain','secretary','kagawad'], feature: 'community_programs' },
  { label: 'Barangay projects', section: 'projects', icon: FolderKanban, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'], feature: 'community_programs' },
  { label: 'Inter-barangay referrals', section: 'referrals', icon: ArrowLeftRight, roles: ['captain','secretary'], feature: 'core_services' },
  { label: 'Health outreach', section: 'health-outreach', icon: HeartHandshake, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'], feature: 'community_programs' },
  { label: 'SK events & programs', section: 'sk-events', icon: CalendarDays, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'], feature: 'community_programs' },
  { label: 'Community calendar', section: 'community-calendar', icon: CalendarDays, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'], feature: 'community_programs' },
  { label: 'SK projects', section: 'sk-projects', icon: FileCheck2, roles: ['captain','sk_chairperson'], feature: 'community_programs' },
  { label: 'SK accomplishments', section: 'sk-accomplishments', icon: Award, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'], feature: 'community_programs' },
  { label: 'Incident reports', section: 'incidents', icon: AlertTriangle, roles: ['captain','tanod','resident'], feature: 'public_safety' },
  { label: 'Tanod patrols', section: 'patrols', icon: ClipboardList, roles: ['captain','tanod'], feature: 'public_safety' },
  { label: 'Disaster advisories', section: 'advisories', icon: Megaphone, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'], feature: 'public_safety' },
  { label: 'Community feedback', section: 'feedback', icon: MessageSquare, roles: ['captain','secretary','resident'], feature: 'core_services' },
  { label: 'Help & support', section: 'support', icon: Headset, roles: ['captain','secretary','treasurer','kagawad','sk_chairperson','bhw','tanod','resident'] },
]

function PlatformWorkspace() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const accountProfile = useQuery({ queryKey: ['account-profile', user?.id], queryFn: () => getOwnAccountDisplayName(user!.id), enabled: Boolean(user?.id), staleTime: 60_000 })
  const accountName = accountProfile.data?.trim() || user?.email || 'Platform administrator'
  const accountInitial = accountName[0]?.toUpperCase() ?? 'A'
  const [activePage, setActivePage] = useState<'overview' | 'onboarding' | 'support' | 'subscriptions' | 'activity'>('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const subscriptionSummary = useQuery({ queryKey: ['platform-subscription-summary'], queryFn: getSubscriptionSummary, enabled: activePage === 'overview', staleTime: 60_000 })
  const needsSubscriptionReview = subscriptionSummary.data?.needs_review_count ?? 0
  const suspendedSubscriptions = subscriptionSummary.data?.suspended_count ?? 0
  const accountSecurityOpenerRef = useRef<HTMLButtonElement>(null)
  const wasAccountSecurityOpenRef = useRef(false)
  useEffect(() => {
    if (accountSecurityOpen) {
      wasAccountSecurityOpenRef.current = true
      return
    }
    if (!wasAccountSecurityOpenRef.current) return
    wasAccountSecurityOpenRef.current = false
    requestAnimationFrame(() => accountSecurityOpenerRef.current?.focus())
  }, [accountSecurityOpen])
  const adminLinks = [
    { label: 'Platform overview', icon: LayoutDashboard, page: 'overview' as const },
    { label: 'Barangay onboarding', icon: Building2, page: 'onboarding' as const },
    { label: 'Support queue', icon: Headset, page: 'support' as const },
    { label: 'Subscriptions & plans', icon: CircleDollarSign, page: 'subscriptions' as const },
    { label: 'Platform activity', icon: Activity, page: 'activity' as const },
  ]
  const pageTitle = activePage === 'support' ? 'Support queue' : activePage === 'onboarding' ? 'Barangay onboarding' : activePage === 'subscriptions' ? 'Subscriptions & plans' : activePage === 'activity' ? 'Platform activity' : 'Overview'
  async function logout() {
    setLogoutConfirmOpen(false)
    setLogoutError('')
    try {
      await signOut()
      navigate('/sign-in', { replace: true })
    } catch {
      setLogoutError('We could not sign you out. Check your connection and try again.')
    }
  }
  return <div className="app-shell platform-shell"><a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={`sidebar platform-sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><ShieldCheck size={21} /></div><div><strong>KABALIKAT</strong><small>PLATFORM ADMIN</small></div><button type="button" className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Close platform menu"><X size={19} /></button></div>
      <div className="tenant-switch"><div className="tenant-icon"><ShieldCheck size={17} /></div><div className="tenant-copy"><span>ADMIN CONSOLE</span><strong>ArkByte Technologies</strong></div></div>
      <div className="nav-label">PLATFORM</div>
      <nav aria-label="Platform navigation">{adminLinks.map(({ label, icon: Icon, page }) => <button key={label} className={`nav-link ${activePage === page ? 'active' : ''}`} aria-current={activePage === page ? 'page' : undefined} onClick={() => { setActivePage(page); setMenuOpen(false) }}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="user-card"><div className="avatar">{accountInitial}</div><div className="user-details"><strong>{accountName}</strong><span>Platform administrator</span></div></div></div>
    </aside>
    <main className="main-area platform-main"><header className="topbar platform-topbar"><button type="button" className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open platform menu" aria-expanded={menuOpen}><Menu size={20} /></button><div className="crumb">Platform <span>/</span> {pageTitle}</div><div className="top-actions"><button ref={accountSecurityOpenerRef} type="button" className="top-avatar account-avatar" onClick={() => setAccountSecurityOpen(true)} aria-label={`Open account security for ${accountName}`}>{accountInitial}</button><button type="button" className="platform-logout" onClick={() => setLogoutConfirmOpen(true)} aria-label="Sign out"><LogOut size={17} /><span>Sign out</span></button></div></header>
      <div className="content-wrap platform-content" id="main-content" tabIndex={-1}>{logoutError && <div className="error-banner" role="alert">{logoutError}</div>}{activePage === 'onboarding' ? <OnboardingPage /> : activePage === 'support' ? <Suspense fallback={<div className="ops-loading" role="status">Loading support queue...</div>}><PlatformSupportPage platformAdmin /></Suspense> : activePage === 'subscriptions' ? <Suspense fallback={<div className="ops-loading" role="status">Loading subscriptions...</div>}><PlatformSubscriptionsPage /></Suspense> : activePage === 'activity' ? <Suspense fallback={<div className="ops-loading" role="status">Loading platform activity...</div>}><PlatformActivityPage /></Suspense> : <><div className="welcome-row"><div><div className="eyebrow">ARKBYTE TECHNOLOGIES</div><h1>Platform overview</h1><p>Manage KABALIKAT service operations from the platform workspace.</p></div><span className="role-pill">Platform administrator</span></div>
        <div className="setup-banner"><div className="setup-icon"><ShieldCheck size={21} /></div><div><strong>Platform access verified</strong><p>This account is listed in the protected platform administrator registry.</p></div></div>
        {subscriptionSummary.isPending && <div className="dashboard-metrics-loading" role="status">Loading subscription review summary...</div>}
        {subscriptionSummary.error && <div className="error-banner" role="alert">Subscription review counts are unavailable. Open subscriptions to refresh the full records.</div>}
        {subscriptionSummary.data && <div className="dashboard-metrics" aria-label="Subscription review summary">
          <button type="button" className="dashboard-metric" onClick={() => setActivePage('subscriptions')}><span className="dashboard-metric-icon orange"><Clock3 size={19} /></span><span><small>Trial or grace periods elapsed</small><strong>{needsSubscriptionReview.toLocaleString()}</strong></span><ArrowRight size={16} /></button>
          <button type="button" className="dashboard-metric" onClick={() => setActivePage('subscriptions')}><span className="dashboard-metric-icon violet"><ShieldCheck size={19} /></span><span><small>Manually suspended accounts</small><strong>{suspendedSubscriptions.toLocaleString()}</strong></span><ArrowRight size={16} /></button>
        </div>}
        <div className="section-heading"><div><h2>Platform tools</h2><p>Open an administration workspace</p></div></div>
        <div className="module-grid">
          <button type="button" className="module-card" onClick={() => setActivePage('subscriptions')}><div className="module-icon orange"><CircleDollarSign size={20} /></div><div><strong>Plans & subscriptions</strong><p>Review plans, subscription records, and change history</p></div><ArrowRight size={17} className="module-arrow" /></button>
          <button type="button" className="module-card" onClick={() => setActivePage('support')}><div className="module-icon blue"><Headset size={20} /></div><div><strong>Support requests</strong><p>Review and respond to barangay support conversations</p></div><ArrowRight size={17} className="module-arrow" /></button>
          <button type="button" className="module-card" onClick={() => setActivePage('onboarding')}><div className="module-icon violet"><Building2 size={20} /></div><div><strong>Barangay onboarding</strong><p>Set up barangay workspaces and review the directory</p></div><ArrowRight size={17} className="module-arrow" /></button>
          <button type="button" className="module-card" onClick={() => setActivePage('activity')}><div className="module-icon blue"><Activity size={20} /></div><div><strong>Platform activity</strong><p>Review high-level onboarding and subscription changes</p></div><ArrowRight size={17} className="module-arrow" /></button>
        </div>
        <PlatformDirectory />
        <section className="panel platform-privacy-panel"><div className="panel-head"><div><h2>Privacy boundary</h2><p>Platform administration is separate from tenant records.</p></div><ShieldCheck size={19} /></div><p>Platform administrators can see barangay names, locations, service status, and aggregate active membership counts. They cannot read private resident, health, document, meeting, or financial records through this directory.</p></section>
        <footer className="footer"><span>© 2026 KABALIKAT by ArkByte Technologies</span><span><ShieldCheck size={14} /> Platform access is audited at the database boundary</span></footer></>}
      </div>
    </main>
    <nav className="platform-mobile-nav" aria-label="Platform quick navigation">{adminLinks.map(({ icon: Icon, page }) => <button key={page} type="button" className={`platform-mobile-nav-item ${activePage === page ? 'active' : ''}`} aria-current={activePage === page ? 'page' : undefined} onClick={() => { setActivePage(page); setMenuOpen(false) }}><Icon size={19} /><span>{page === 'overview' ? 'Home' : page === 'onboarding' ? 'Onboard' : page === 'support' ? 'Support' : page === 'subscriptions' ? 'Plans' : 'Activity'}</span></button>)}</nav>
    {menuOpen && <button type="button" className="scrim" aria-label="Close platform menu" onClick={() => setMenuOpen(false)} />}
    {accountSecurityOpen && <AccountSecurityDialog email={user?.email ?? ''} userId={user?.id ?? ''} tenantId={null} onClose={() => setAccountSecurityOpen(false)} />}
    {logoutConfirmOpen && <LogoutConfirmationDialog onCancel={() => setLogoutConfirmOpen(false)} onConfirm={() => void logout()} />}
  </div>
}

function Workspace() {
  const { user, membership, memberships, switchMembership, loading, error, signOut } = useAuth()
  const navigate = useNavigate()
  const accountProfile = useQuery({ queryKey: ['account-profile', user?.id], queryFn: () => getOwnAccountDisplayName(user!.id), enabled: Boolean(user?.id), staleTime: 60_000 })
  const accountName = accountProfile.data?.trim() || user?.email?.split('@')[0] || 'Community member'
  const accountInitial = accountName[0]?.toUpperCase() ?? 'U'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeMenuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const menuButton = menuButtonRef.current
    closeMenuButtonRef.current?.focus()
    return () => {
      if (window.matchMedia('(max-width: 650px)').matches) menuButton?.focus()
    }
  }, [menuOpen])
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<OperationSection | 'overview'>('overview')
  const [focusedCommunityUpdate, setFocusedCommunityUpdate] = useState<{ section: 'announcements' | 'advisories' | 'documents' | 'feedback' | 'support' | 'residents' | 'meetings' | 'health-outreach' | 'sk-events' | 'incidents' | 'patrols'; id: string; page?: number; healthStatus?: 'draft' | 'changes_requested' | 'published' | 'cancelled' | 'completed' } | null>(null)
  const clearFocusedCommunityUpdate = useCallback(() => setFocusedCommunityUpdate(null), [])
  const [toolFinderOpen, setToolFinderOpen] = useState(false)
  const [toolQuery, setToolQuery] = useState('')
  const toolFinderFocus = useModalFocus<HTMLElement>()
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const updatesDialogFocus = useModalFocus<HTMLElement>()
  const [notificationActionError, setNotificationActionError] = useState('')
  const planFeaturesQuery = useQuery({
    queryKey: ['barangay-plan-features', membership?.barangay_id],
    queryFn: () => getBarangayPlanFeatures(membership!.barangay_id),
    enabled: Boolean(membership?.barangay_id), staleTime: 60_000, refetchInterval: 60_000,
  })
  const visibleNav = useMemo(() => nav.filter((item) =>
    (item.roles.length === 0 || item.roles.includes(membership?.role?.key ?? ''))
      && (!item.feature || planFeaturesQuery.isPending || planFeaturesQuery.data?.[item.feature] === true),
  ), [membership?.role?.key, planFeaturesQuery.data, planFeaturesQuery.isPending])
  useEffect(() => {
    if (activeSection !== 'overview' && !visibleNav.some((item) => item.section === activeSection)) {
      setActiveSection('overview')
    }
  }, [activeSection, visibleNav])
  const canReadCommunityCalendar = visibleNav.some((item) => item.section === 'community-calendar')
  async function logout() {
    setLogoutConfirmOpen(false)
    setLogoutError('')
    try {
      await signOut()
      navigate('/sign-in', { replace: true })
    } catch {
      setLogoutError('We could not sign you out. Check your connection and try again.')
    }
  }
  const upcomingEvents = useQuery({ queryKey: ['community-calendar-preview', membership?.barangay_id], queryFn: () => listUpcomingCommunityEvents(membership!.barangay_id, 3), enabled: Boolean(membership?.barangay_id && canReadCommunityCalendar && activeSection === 'overview'), staleTime: 60_000 })
  const dashboard = useQuery({ queryKey: ['workspace-dashboard', membership?.barangay_id], queryFn: () => getWorkspaceDashboardMetrics(membership!.barangay_id), enabled: Boolean(membership?.barangay_id && activeSection === 'overview'), staleTime: 60_000 })
  const captainReviewQueue = useQuery({ queryKey: ['captain-review-queue', membership?.barangay_id], queryFn: () => getCaptainReviewQueueSummary(membership!.barangay_id), enabled: Boolean(membership?.barangay_id && membership.role?.key === 'captain' && activeSection === 'overview'), staleTime: 0 })
  const secretaryReviewQueue = useQuery({ queryKey: ['secretary-review-queue', membership?.barangay_id], queryFn: () => getSecretaryReviewQueueSummary(membership!.barangay_id), enabled: Boolean(membership?.barangay_id && membership.role?.key === 'secretary' && activeSection === 'overview'), staleTime: 0 })
  const treasurerFollowUp = useQuery({ queryKey: ['treasurer-follow-up', membership?.barangay_id], queryFn: () => getTreasurerFollowUpSummary(membership!.barangay_id), enabled: Boolean(membership?.barangay_id && membership.role?.key === 'treasurer' && activeSection === 'overview'), staleTime: 0 })
  const kagawadActionItems = useQuery({ queryKey: ['kagawad-action-items', membership?.barangay_id], queryFn: () => getKagawadActionItemSummary(membership!.barangay_id), enabled: Boolean(membership?.barangay_id && membership.role?.key === 'kagawad' && activeSection === 'overview'), staleTime: 0 })
  const notifications = useInfiniteQuery({ queryKey: ['community-notifications', membership?.barangay_id], queryFn: ({ pageParam }) => listCommunityNotificationPage(membership!.barangay_id, pageParam), initialPageParam: 0, getNextPageParam: (lastPage, allPages) => allPages.reduce((total, page) => total + page.rows.length, 0) < lastPage.totalCount ? allPages.length : undefined, enabled: Boolean(membership?.barangay_id), staleTime: 20_000, refetchInterval: 60_000, refetchIntervalInBackground: false })
  const unreadNotificationCount = useQuery({ queryKey: ['community-notification-unread-count', membership?.barangay_id], queryFn: () => countUnreadCommunityNotifications(membership!.barangay_id), enabled: Boolean(membership?.barangay_id), staleTime: 20_000, refetchInterval: 60_000, refetchIntervalInBackground: false })
  const announcements = useInfiniteQuery({ queryKey: ['workspace-updates-announcements', membership?.barangay_id], queryFn: ({ pageParam }) => listRecentAnnouncements(membership!.barangay_id, pageParam), initialPageParam: 0, getNextPageParam: (lastPage, allPages) => allPages.reduce((total, page) => total + page.announcements.length, 0) < lastPage.totalCount ? allPages.length : undefined, enabled: Boolean(updatesOpen && membership?.barangay_id), staleTime: 60_000 })
  const advisories = useInfiniteQuery({ queryKey: ['workspace-updates-advisories', membership?.barangay_id], queryFn: ({ pageParam }) => listRecentDisasterAdvisories(membership!.barangay_id, pageParam), initialPageParam: 0, getNextPageParam: (lastPage, allPages) => allPages.reduce((total, page) => total + page.advisories.length, 0) < lastPage.totalCount ? allPages.length : undefined, enabled: Boolean(updatesOpen && membership?.barangay_id), staleTime: 60_000 })
  const notificationRows = notifications.data?.pages.flatMap((page) => page.rows) ?? []
  const meetingUpdateEventIds = notificationRows.filter((item) => item.resource_type === 'meeting_update').map((item) => item.resource_id)
  const meetingUpdateDetails = useQuery({
    queryKey: ['meeting-update-notification-details', membership?.barangay_id, meetingUpdateEventIds],
    queryFn: () => listMeetingUpdateNotificationDetails(meetingUpdateEventIds),
    enabled: Boolean(updatesOpen && meetingUpdateEventIds.length), staleTime: 20_000,
  })
  const meetingResolutionIds = notificationRows.filter((item) => item.resource_type === 'meeting_resolution').map((item) => item.resource_id)
  const meetingResolutionDetails = useQuery({
    queryKey: ['meeting-resolution-notification-details', membership?.barangay_id, meetingResolutionIds],
    queryFn: () => listMeetingResolutionNotificationDetails(meetingResolutionIds),
    enabled: Boolean(updatesOpen && meetingResolutionIds.length), staleTime: 20_000,
  })
  const healthOutreachIds = notificationRows.filter((item) => item.resource_type === 'health_outreach_published' || item.resource_type === 'health_outreach_cancellation' || item.resource_type === 'health_outreach_completion').map((item) => item.resource_id)
  const healthOutreachDetails = useQuery({
    queryKey: ['health-outreach-notification-details', membership?.barangay_id, healthOutreachIds],
    queryFn: () => listHealthOutreachUpdateDetails(membership!.barangay_id, healthOutreachIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && healthOutreachIds.length), staleTime: 20_000,
  })
  const healthOutreachRescheduleIds = notificationRows.filter((item) => item.resource_type === 'health_outreach_rescheduled').map((item) => item.resource_id)
  const healthOutreachRescheduleDetails = useQuery({
    queryKey: ['health-outreach-reschedule-notification-details', membership?.barangay_id, healthOutreachRescheduleIds],
    queryFn: () => listHealthOutreachRescheduleDetails(membership!.barangay_id, healthOutreachRescheduleIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && healthOutreachRescheduleIds.length), staleTime: 20_000,
  })
  const healthReviewEventIds = notificationRows.filter((item) => item.resource_type === 'health_outreach_review').map((item) => item.resource_id)
  const healthReviewDetails = useQuery({
    queryKey: ['health-outreach-review-notification-details', membership?.barangay_id, healthReviewEventIds],
    queryFn: () => listHealthOutreachReviewDetails(membership!.barangay_id, healthReviewEventIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && healthReviewEventIds.length), staleTime: 20_000,
  })
  const healthReviewSubmissionIds = notificationRows.filter((item) => item.resource_type === 'health_outreach_review_submission').map((item) => item.resource_id)
  const healthReviewSubmissionDetails = useQuery({
    queryKey: ['health-outreach-review-submission-notification-details', membership?.barangay_id, healthReviewSubmissionIds],
    queryFn: () => listHealthOutreachReviewSubmissionDetails(membership!.barangay_id, healthReviewSubmissionIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && healthReviewSubmissionIds.length), staleTime: 20_000,
  })
  const skReviewSubmissionIds = notificationRows.filter((item) => item.resource_type === 'sk_event_review_submission').map((item) => item.resource_id)
  const skReviewSubmissionDetails = useQuery({
    queryKey: ['sk-event-review-submission-notification-details', membership?.barangay_id, skReviewSubmissionIds],
    queryFn: () => listSkEventReviewSubmissionDetails(membership!.barangay_id, skReviewSubmissionIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && skReviewSubmissionIds.length), staleTime: 20_000,
  })
  const skPublicationIds = notificationRows.filter((item) => item.resource_type === 'sk_event_published').map((item) => item.resource_id)
  const skPublicationDetails = useQuery({
    queryKey: ['sk-event-publication-notification-details', membership?.barangay_id, skPublicationIds],
    queryFn: () => listSkEventPublicationDetails(membership!.barangay_id, skPublicationIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && skPublicationIds.length), staleTime: 20_000,
  })
  const skCompletionIds = notificationRows.filter((item) => item.resource_type === 'sk_event_completed').map((item) => item.resource_id)
  const skCompletionDetails = useQuery({
    queryKey: ['sk-event-completion-notification-details', membership?.barangay_id, skCompletionIds],
    queryFn: () => listSkEventCompletionDetails(membership!.barangay_id, skCompletionIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && skCompletionIds.length), staleTime: 20_000,
  })
  const skReviewFeedbackIds = notificationRows.filter((item) => item.resource_type === 'sk_event_review_feedback').map((item) => item.resource_id)
  const skReviewFeedbackDetails = useQuery({
    queryKey: ['sk-event-review-feedback-notification-details', membership?.barangay_id, skReviewFeedbackIds],
    queryFn: () => listSkEventReviewFeedbackDetails(membership!.barangay_id, skReviewFeedbackIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && skReviewFeedbackIds.length), staleTime: 20_000,
  })
  const skCancellationIds = notificationRows.filter((item) => item.resource_type === 'sk_event_cancelled').map((item) => item.resource_id)
  const skCancellationDetails = useQuery({
    queryKey: ['sk-event-cancellation-notification-details', membership?.barangay_id, skCancellationIds],
    queryFn: () => listSkEventCancellationDetails(membership!.barangay_id, skCancellationIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && skCancellationIds.length), staleTime: 20_000,
  })
  const skRescheduleIds = notificationRows.filter((item) => item.resource_type === 'sk_event_rescheduled').map((item) => item.resource_id)
  const skRescheduleDetails = useQuery({
    queryKey: ['sk-event-reschedule-notification-details', membership?.barangay_id, skRescheduleIds],
    queryFn: () => listSkEventRescheduleDetails(membership!.barangay_id, skRescheduleIds),
    enabled: Boolean(updatesOpen && membership?.barangay_id && skRescheduleIds.length), staleTime: 20_000,
  })
  const announcementUpdates = (announcements.data?.pages.flatMap((page) => page.announcements) ?? []).filter((item) => item.status === 'published' && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()))
    .map((item) => ({ id: item.id, title: item.title, kind: 'Announcement', resourceType: 'announcement' as const, timestamp: item.published_at ?? item.created_at, section: 'announcements' as const }))
  const advisoryUpdates = (advisories.data?.pages.flatMap((page) => page.advisories) ?? []).filter((item) => item.status === 'published' && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()))
    .map((item) => ({ id: item.id, title: item.title, kind: 'Disaster advisory', resourceType: 'disaster_advisory' as const, timestamp: item.published_at ?? item.created_at, section: 'advisories' as const }))
  const loadedUpdateKeys = new Set([...announcementUpdates, ...advisoryUpdates].map((item) => `${item.resourceType}:${item.id}`))
  const olderPublishedUpdateItems = notificationRows.filter((item) =>
    (item.resource_type === 'announcement' || item.resource_type === 'disaster_advisory')
      && !loadedUpdateKeys.has(`${item.resource_type}:${item.resource_id}`),
  ).map((item) => ({
    id: item.resource_id,
    title: item.resource_type === 'announcement' ? 'A published announcement is available' : 'A disaster advisory is available',
    kind: item.resource_type === 'announcement' ? 'Announcement' : 'Disaster advisory',
    resourceType: item.resource_type,
    timestamp: item.created_at,
    section: item.resource_type === 'announcement' ? 'announcements' as const : 'advisories' as const,
  }))
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setToolFinderOpen(true)
      } else if (event.key === 'Escape') { setToolFinderOpen(false); setToolQuery(''); setUpdatesOpen(false); setWorkspacePickerOpen(false) }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])
  if (loading) return <div className="center-state"><span className="spinner" />Loading your secure workspace...</div>
  if (!user) return <Navigate to="/sign-in" replace />
  const barangay = membership?.barangay
  const mobileShortcutOrder: Array<{ section: OperationSection; label: string }> = [
    { section: 'residents', label: 'Residents' },
    { section: 'documents', label: 'Documents' },
    { section: 'announcements', label: 'Updates' },
    { section: 'meetings', label: 'Meetings' },
    { section: 'projects', label: 'Projects' },
    { section: 'incidents', label: 'Incidents' },
    { section: 'advisories', label: 'Safety' },
    { section: 'feedback', label: 'Feedback' },
    { section: 'support', label: 'Help' },
  ]
  const mobileShortcuts = mobileShortcutOrder.flatMap((shortcut) => {
    const item = visibleNav.find((entry) => entry.section === shortcut.section)
    return item ? [{ ...item, shortLabel: shortcut.label }] : []
  }).slice(0, 3)
  const filteredTools = visibleNav.filter((item) => item.label.toLocaleLowerCase().includes(toolQuery.trim().toLocaleLowerCase()))
  const currentUpdates = [
    ...announcementUpdates,
    ...advisoryUpdates,
    ...olderPublishedUpdateItems,
    ...notificationRows.filter((item) => item.resource_type === 'resident_profile_change')
      .map((item) => ({ id: item.resource_id, title: 'A decision is available for your profile correction request', kind: 'Profile request', resourceType: 'resident_profile_change' as const, timestamp: item.created_at, section: 'residents' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'document_request')
      .map((item) => ({ id: item.resource_id, title: 'Your document request status has changed', kind: 'Document request', resourceType: 'document_request' as const, timestamp: item.created_at, section: 'documents' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'community_feedback')
      .map((item) => ({ id: item.resource_id, title: 'The barangay office updated your feedback', kind: 'Feedback update', resourceType: 'community_feedback' as const, timestamp: item.created_at, section: 'feedback' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'meeting_resolution')
      .map((item) => {
        const detail = meetingResolutionDetails.data?.find((entry) => entry.resolution_id === item.resource_id)
        return { id: item.resource_id, meetingId: detail?.meeting_id ?? '', meetingPage: detail?.page_number ?? 0, title: 'Your meeting resolution was approved', kind: 'Resolution decision', resourceType: 'meeting_resolution' as const, timestamp: item.created_at, section: 'meetings' as const }
      }),
    ...notificationRows.filter((item) => item.resource_type === 'support_ticket_update')
      .map((item) => ({ id: item.resource_id, title: 'The support team updated your request', kind: 'Support update', resourceType: 'support_ticket_update' as const, timestamp: item.created_at, section: 'support' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'incident_assignment')
      .map((item) => ({ id: item.resource_id, title: 'A safety report has been assigned to you', kind: 'Incident assignment', resourceType: 'incident_assignment' as const, timestamp: item.created_at, section: 'incidents' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'incident_status_change')
      .map((item) => ({ id: item.resource_id, title: 'Your incident report has a status update', kind: 'Incident update', resourceType: 'incident_status_change' as const, timestamp: item.created_at, section: 'incidents' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'patrol_shift_assignment')
      .map((item) => ({ id: item.resource_id, title: 'A patrol shift has been assigned to you', kind: 'Patrol assignment', resourceType: 'patrol_shift_assignment' as const, timestamp: item.created_at, section: 'patrols' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'patrol_shift_cancelled')
      .map((item) => ({ id: item.resource_id, title: 'A patrol shift assigned to you has been cancelled', kind: 'Patrol cancellation', resourceType: 'patrol_shift_cancelled' as const, timestamp: item.created_at, section: 'patrols' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'patrol_shift_rescheduled')
      .map((item) => ({ id: item.resource_id, title: 'A patrol shift assigned to you has changed', kind: 'Patrol schedule change', resourceType: 'patrol_shift_rescheduled' as const, timestamp: item.created_at, section: 'patrols' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'patrol_shift_started')
      .map((item) => ({ id: item.resource_id, title: 'An assigned Tanod started a patrol shift', kind: 'Patrol started', resourceType: 'patrol_shift_started' as const, timestamp: item.created_at, section: 'patrols' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'patrol_shift_completed')
      .map((item) => ({ id: item.resource_id, title: 'An assigned Tanod completed a patrol shift', kind: 'Patrol completed', resourceType: 'patrol_shift_completed' as const, timestamp: item.created_at, section: 'patrols' as const })),
    ...notificationRows.filter((item) => item.resource_type === 'health_outreach_published' || item.resource_type === 'health_outreach_cancellation' || item.resource_type === 'health_outreach_completion').map((item) => {
      const detail = healthOutreachDetails.data?.find((entry) => entry.campaign_id === item.resource_id)
      const status = item.resource_type === 'health_outreach_published' ? 'published' as const : item.resource_type === 'health_outreach_cancellation' ? 'cancelled' as const : 'completed' as const
      const attendance = detail?.attendance_count
      const title = detail ? `Health outreach ${status}: ${detail.title}${detail.status === 'completed' && typeof attendance === 'number' ? ` · ${attendance.toLocaleString()} community members reached` : ''}` : `A health outreach schedule was ${status}`
      const kind = status === 'cancelled' ? 'Health outreach cancelled' : status === 'completed' ? 'Health outreach completed' : 'Health outreach published'
      return { id: item.resource_id, title, kind, resourceType: item.resource_type, timestamp: item.created_at, section: 'health-outreach' as const, reason: detail?.status === 'cancelled' ? detail.cancellation_reason?.trim() || null : null, page: detail?.page_number ?? 0, healthStatus: detail?.status ?? status }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'health_outreach_rescheduled').map((item) => {
      const detail = healthOutreachRescheduleDetails.data?.find((entry) => entry.campaign_id === item.resource_id)
      const previous = detail ? `Previously ${new Date(detail.previous_starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} at ${detail.previous_location}` : null
      return { id: item.resource_id, focusId: item.resource_id, title: detail ? `Health outreach rescheduled: ${detail.title}` : 'A health outreach schedule has changed', kind: 'Health outreach schedule change', resourceType: 'health_outreach_rescheduled' as const, timestamp: item.created_at, section: 'health-outreach' as const, page: detail?.page_number ?? 0, healthStatus: detail?.status ?? 'published' as const, reason: detail?.reason ?? null, previousSchedule: previous }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'health_outreach_review').map((item) => {
      const detail = healthReviewDetails.data?.find((entry) => entry.event_id === item.resource_id)
      const healthStatus = detail?.campaign_status ?? 'changes_requested'
      return { id: item.resource_id, focusId: detail?.campaign_id, title: detail ? `Changes requested: ${detail.title}` : 'Changes were requested for your health outreach schedule', kind: 'Outreach review feedback', resourceType: 'health_outreach_review' as const, timestamp: item.created_at, section: 'health-outreach' as const, reason: detail?.review_note || null, page: detail?.page_number ?? 0, healthStatus }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'health_outreach_review_submission').map((item) => {
      const detail = healthReviewSubmissionDetails.data?.find((entry) => entry.campaign_id === item.resource_id)
      return { id: item.resource_id, focusId: item.resource_id, title: detail ? `Schedule ready for review: ${detail.title}` : 'A health outreach schedule is ready for review', kind: 'Outreach review queue', resourceType: 'health_outreach_review_submission' as const, timestamp: item.created_at, section: 'health-outreach' as const, page: detail?.page_number ?? 0, healthStatus: 'draft' as const }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'sk_event_review_submission').map((item) => {
      const detail = skReviewSubmissionDetails.data?.find((entry) => entry.event_id === item.resource_id)
      return { id: item.resource_id, focusId: item.resource_id, title: detail ? `SK event ready for review: ${detail.title}` : 'An SK event schedule is ready for review', kind: 'SK event review queue', resourceType: 'sk_event_review_submission' as const, timestamp: item.created_at, section: 'sk-events' as const, page: detail?.page_number ?? 0, healthStatus: 'draft' as const }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'sk_event_published').map((item) => {
      const detail = skPublicationDetails.data?.find((entry) => entry.event_id === item.resource_id)
      const status = detail?.status ?? 'published'
      return { id: item.resource_id, focusId: item.resource_id, title: detail ? `New SK event ${status}: ${detail.title}` : 'A new SK event schedule has been published', kind: 'SK event update', resourceType: 'sk_event_published' as const, timestamp: item.created_at, section: 'sk-events' as const, page: detail?.page_number ?? 0, healthStatus: status }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'sk_event_completed').map((item) => {
      const detail = skCompletionDetails.data?.find((entry) => entry.event_id === item.resource_id)
      return { id: item.resource_id, focusId: item.resource_id, title: detail ? `SK event completed: ${detail.title}` : 'An SK event has been completed', kind: 'SK event completion', resourceType: 'sk_event_completed' as const, timestamp: item.created_at, section: 'sk-events' as const, page: detail?.page_number ?? 0, healthStatus: 'completed' as const }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'sk_event_review_feedback').map((item) => {
      const detail = skReviewFeedbackDetails.data?.find((entry) => entry.event_id === item.resource_id)
      return { id: item.resource_id, focusId: item.resource_id, title: detail ? `Changes requested: ${detail.title}` : 'Captain feedback is available for your SK event', kind: 'SK event review feedback', resourceType: 'sk_event_review_feedback' as const, timestamp: item.created_at, section: 'sk-events' as const, page: detail?.page_number ?? 0, healthStatus: 'changes_requested' as const, reason: detail?.review_note ?? null }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'sk_event_cancelled').map((item) => {
      const detail = skCancellationDetails.data?.find((entry) => entry.event_id === item.resource_id)
      return { id: item.resource_id, focusId: item.resource_id, title: detail ? `SK event cancelled: ${detail.title}` : 'An SK event has been cancelled', kind: 'SK event cancellation', resourceType: 'sk_event_cancelled' as const, timestamp: item.created_at, section: 'sk-events' as const, page: detail?.page_number ?? 0, healthStatus: 'cancelled' as const, reason: detail?.cancellation_reason ?? null }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'sk_event_rescheduled').map((item) => {
      const detail = skRescheduleDetails.data?.find((entry) => entry.event_id === item.resource_id)
      const previous = detail ? `Previously ${new Date(detail.previous_starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} at ${detail.previous_location}` : null
      return { id: item.resource_id, focusId: item.resource_id, title: detail ? `SK event rescheduled: ${detail.title}` : 'An SK event schedule has changed', kind: 'SK event schedule change', resourceType: 'sk_event_rescheduled' as const, timestamp: item.created_at, section: 'sk-events' as const, page: detail?.page_number ?? 0, healthStatus: detail?.status ?? 'published', reason: detail?.reason ?? null, previousSchedule: previous }
    }),
    ...notificationRows.filter((item) => item.resource_type === 'meeting_update').map((item) => {
      const detail = meetingUpdateDetails.data?.find((entry) => entry.event_id === item.resource_id)
        const fields = detail?.changed_fields ?? []
        const status = fields[0] === 'status' ? fields[1] : undefined
        const action = status === 'cancelled' ? 'cancelled' : status === 'completed' ? 'completed' : 'updated'
        const fieldLabels: Record<string, string> = { title: 'title', location: 'location', starts_at: 'start time', ends_at: 'end time', agenda: 'agenda' }
        const changedSummary = fields.filter((field) => field !== 'status').map((field) => fieldLabels[field]).filter(Boolean).join(', ')
        const meetingSchedule = fields.some((field) => field === 'starts_at' || field === 'ends_at') && detail
          ? `Starts ${new Date(detail.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}${detail.ends_at ? `; ends ${new Date(detail.ends_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`
          : null
        const meetingLocation = fields.includes('location') ? detail?.location || null : null
        return { id: item.resource_id, meetingId: detail?.meeting_id ?? '', meetingPage: detail?.page_number ?? 0, changedSummary: changedSummary || null, meetingSchedule, meetingLocation, reason: status === 'cancelled' || status === 'completed' ? detail?.reason?.trim() || null : null, title: detail ? `Meeting ${action}: ${detail.title}` : 'A meeting you are invited to has changed', kind: status === 'cancelled' ? 'Meeting cancelled' : status === 'completed' ? 'Meeting completed' : 'Meeting update', resourceType: 'meeting_update' as const, timestamp: item.created_at, section: 'meetings' as const }
    }),
  ].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
  const unreadNotifications = notificationRows.filter((item) => !item.read_at)
  const unreadCount = unreadNotificationCount.data
  async function openCommunityUpdate(item: (typeof currentUpdates)[number]) {
    setNotificationActionError('')
    setFocusedCommunityUpdate(item.resourceType === 'incident_assignment' || item.resourceType === 'incident_status_change'
      ? { section: 'incidents', id: item.id }
      : item.resourceType === 'meeting_update' || item.resourceType === 'meeting_resolution'
      ? 'meetingId' in item && item.meetingId ? { section: 'meetings', id: item.meetingId, page: item.meetingPage } : null
      : ['announcement', 'disaster_advisory', 'document_request', 'community_feedback', 'support_ticket_update', 'health_outreach_published', 'health_outreach_cancellation', 'health_outreach_completion', 'health_outreach_review', 'health_outreach_review_submission', 'health_outreach_rescheduled', 'sk_event_review_submission', 'sk_event_published', 'sk_event_completed', 'sk_event_review_feedback', 'sk_event_cancelled', 'sk_event_rescheduled', 'patrol_shift_assignment', 'patrol_shift_cancelled', 'patrol_shift_rescheduled', 'patrol_shift_started', 'patrol_shift_completed'].includes(item.resourceType)
      ? { section: item.section as 'announcements' | 'advisories' | 'documents' | 'feedback' | 'support' | 'health-outreach' | 'sk-events' | 'patrols', id: 'focusId' in item && item.focusId ? item.focusId : item.id, page: 'page' in item ? item.page : undefined, healthStatus: 'healthStatus' in item ? item.healthStatus : undefined }
      : item.resourceType === 'resident_profile_change' ? { section: 'residents', id: item.id }
      : null)
    const notification = notificationRows.find((entry) => entry.resource_type === item.resourceType && entry.resource_id === item.id && !entry.read_at)
    if (notification && membership?.barangay_id) {
      try {
        await markCommunityNotificationRead(notification.id, membership.barangay_id)
        await Promise.all([notifications.refetch(), unreadNotificationCount.refetch()])
      } catch { setNotificationActionError('This update was opened, but its read status could not be saved.') }
    }
    openTool(item.section)
  }
  async function markAllCommunityUpdatesRead() {
    if (!membership?.barangay_id) return
    setNotificationActionError('')
    try {
      await markAllCommunityNotificationsRead(membership.barangay_id)
      await Promise.all([notifications.refetch(), unreadNotificationCount.refetch()])
    } catch { setNotificationActionError('Unable to mark updates as read. Please try again.') }
  }
  function openTool(section: OperationSection | 'overview') {
    setActiveSection(section); setMenuOpen(false); setToolFinderOpen(false); setToolQuery(''); setUpdatesOpen(false)
  }
  function closeToolFinder() { setToolFinderOpen(false); setToolQuery('') }
  return <div className={`app-shell workspace-shell ${membership?.role?.key === 'captain' ? 'captain-workspace' : ''}`}><a className="skip-link" href="#main-content">Skip to main content</a>
    <aside ref={sidebarRef} id="workspace-sidebar" className={`sidebar ${menuOpen ? 'open' : ''}`} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen ? true : undefined} aria-label={menuOpen ? 'Workspace navigation' : undefined} onKeyDown={(event) => {
      if (event.key === 'Escape') { setMenuOpen(false); return }
      if (event.key !== 'Tab') return
      const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
      if (!focusable?.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
      <div className="brand"><div className="brand-mark"><HeartHandshake size={21} /></div><div><strong>KABALIKAT</strong><small>BARANGAY SERVICES</small></div><button ref={closeMenuButtonRef} type="button" className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      {barangay && <div className="workspace-picker"><button type="button" className="tenant-switch" aria-expanded={workspacePickerOpen} aria-controls="workspace-picker-options" disabled={memberships.length < 2} onClick={() => setWorkspacePickerOpen((open) => !open)}><div className="tenant-icon"><Building2 size={17} /></div><div className="tenant-copy"><span>ACTIVE BARANGAY</span><strong>{barangay.name}</strong><small>{barangay.municipality}, {barangay.province}</small></div>{memberships.length > 1 && <ChevronDown size={15} />}</button>{workspacePickerOpen && memberships.length > 1 && <div className="workspace-picker-menu" id="workspace-picker-options"><p>Choose an authorized barangay</p>{memberships.map((item) => <button key={item.id} type="button" aria-current={item.id === membership?.id ? 'true' : undefined} onClick={() => { switchMembership(item.id); setWorkspacePickerOpen(false); setActiveSection('overview'); setMenuOpen(false) }}><Building2 size={16} /><span><strong>{item.barangay?.name}</strong><small>{item.role?.label} · {item.barangay?.municipality}</small></span>{item.id === membership?.id && <CheckCircle2 size={15} />}</button>)}</div>}</div>}
      <div className="nav-label">WORKSPACE</div>
      <nav>{visibleNav.map(({ label, section, icon: Icon }) => <button key={label} className={`nav-link ${activeSection === section ? 'active' : ''}`} aria-current={activeSection === section ? 'page' : undefined} onClick={() => { setActiveSection(section); setMenuOpen(false) }}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="user-card"><div className="avatar">{accountInitial}</div><div className="user-details"><strong>{accountName}</strong><span>{membership?.role?.label ?? 'No active membership'}</span></div><button className="icon-button" onClick={() => setLogoutConfirmOpen(true)} aria-label="Sign out"><LogOut size={17} /></button></div></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <main className="main-area"><header className="topbar"><div className="crumb">Workspace <span>/</span> {nav.find((item) => item.section === activeSection)?.label ?? 'Overview'}</div><div className="top-actions"><button className="search-control" onClick={() => setToolFinderOpen(true)} aria-label="Find a workspace tool"><Search size={17} /><span>Find a tool</span><kbd>Ctrl K</kbd></button><button className="icon-button search-control-mobile" onClick={() => setToolFinderOpen(true)} aria-label="Find a workspace tool"><Search size={18} /></button><button className="icon-button notification" aria-label={unreadNotificationCount.isError ? 'Open community updates; unread count unavailable' : unreadCount ? 'Open community updates, ' + unreadCount + ' unread' : 'Open community updates'} aria-haspopup="dialog" onClick={() => setUpdatesOpen(true)} disabled={!membership}><Bell size={19} />{Boolean(unreadCount && unreadCount > 0) && <span className="notification-badge" aria-hidden="true">{(unreadCount ?? 0) > 99 ? '99+' : (unreadCount ?? 0)}</span>}</button><button type="button" className="top-avatar account-avatar" onClick={() => setAccountSecurityOpen(true)} aria-label={`Open account security for ${accountName}`}>{accountInitial}</button></div></header>
      <div className="content-wrap" id="main-content" tabIndex={-1}>
        {error && <div className="error-banner" role="alert">{error}</div>}{logoutError && <div className="error-banner" role="alert">{logoutError}</div>}
        {!membership ? <section className="empty-state"><div className="empty-icon"><Building2 size={25} /></div><h1>No barangay workspace yet</h1><p>Your subscription plan does not create account access by itself. Ask the Super Admin to issue an email-bound invitation for your account and intended role. For a Captain on an existing barangay, they can create the invitation from <strong>Barangay onboarding</strong> using your barangay code and this account's email. Open the link, sign in with the same email, and select <strong>Accept invitation</strong>.</p><div className="empty-foot"><ShieldCheck size={16} />Your account cannot select or change its own tenant. Membership is granted when an authorized invitation is accepted.</div></section> : activeSection !== 'overview' ? <OperationsSection section={activeSection} focusId={focusedCommunityUpdate?.section === activeSection ? focusedCommunityUpdate.id : undefined} focusPage={focusedCommunityUpdate?.section === activeSection ? focusedCommunityUpdate.page : undefined} focusStatus={focusedCommunityUpdate?.section === activeSection ? focusedCommunityUpdate.healthStatus : undefined} onFocusHandled={clearFocusedCommunityUpdate} onOpenInvitations={() => setActiveSection('invitations')} /> : <>
          <div className="welcome-row"><div><div className="eyebrow">{barangay?.municipality}, {barangay?.province}</div><h1>Good day, {accountName}</h1><p>Here's what's happening in your community today.</p></div><div className="workspace-date"><CalendarDays size={17} /><span>{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span></div></div>
          <div className="setup-banner"><div className="setup-icon"><CheckCircle2 size={21} /></div><div><strong>Your workspace overview is ready</strong><p>Counts below are limited to information your assigned role can access.</p></div></div>
          {dashboard.isPending && <div className="dashboard-metrics-loading" role="status">Loading your workspace summary...</div>}
          {dashboard.error && <div className="error-banner" role="alert">Unable to load the workspace summary. You can still open your available tools.</div>}
          {dashboard.data && <div className="dashboard-metrics" aria-label="Workspace summary">
            {dashboard.data.residents !== null && <button className="dashboard-metric" onClick={() => setActiveSection('residents')}><span className="dashboard-metric-icon green"><Users size={19} /></span><span><small>Active residents</small><strong>{dashboard.data.residents.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            {dashboard.data.pending_documents !== null && <button className="dashboard-metric" onClick={() => setActiveSection('documents')}><span className="dashboard-metric-icon orange"><FileText size={19} /></span><span><small>Documents to review</small><strong>{dashboard.data.pending_documents.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            {dashboard.data.upcoming_meetings !== null && <button className="dashboard-metric" onClick={() => setActiveSection('meetings')}><span className="dashboard-metric-icon blue"><Clock3 size={19} /></span><span><small>Upcoming meetings</small><strong>{dashboard.data.upcoming_meetings.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            {membership.role?.key !== 'captain' && membership.role?.key !== 'treasurer' && dashboard.data.pending_finance !== null && <button className="dashboard-metric" onClick={() => setActiveSection('finance')}><span className="dashboard-metric-icon violet"><WalletCards size={19} /></span><span><small>Finance entries to review</small><strong>{dashboard.data.pending_finance.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            {dashboard.data.published_announcements !== null && <button className="dashboard-metric" onClick={() => setActiveSection('announcements')}><span className="dashboard-metric-icon green"><Megaphone size={19} /></span><span><small>Current announcements</small><strong>{dashboard.data.published_announcements.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
          </div>}
          {membership.role?.key === 'captain' && <section className="captain-review-queue" aria-labelledby="captain-review-queue-title">
            <div className="section-heading"><div><h2 id="captain-review-queue-title">Captain review queue</h2><p>Decisions and follow-up items across your barangay.</p></div><span className="role-pill">Private summary</span></div>
            {captainReviewQueue.isPending && <div className="dashboard-metrics-loading" role="status">Loading review totals...</div>}
            {captainReviewQueue.error && <div className="error-banner" role="alert">Review totals could not be loaded. Open each workspace to check its queue.</div>}
            {captainReviewQueue.data && <div className="dashboard-metrics captain-review-metrics" aria-label="Captain review queue totals">
              {captainReviewQueue.data.pending_residency_verifications !== null && <button className="dashboard-metric" onClick={() => setActiveSection('residents')}><span className="dashboard-metric-icon green"><Users size={19} /></span><span><small>Residency checks</small><strong>{captainReviewQueue.data.pending_residency_verifications.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_profile_corrections !== null && <button className="dashboard-metric" onClick={() => setActiveSection('residents')}><span className="dashboard-metric-icon blue"><ShieldCheck size={19} /></span><span><small>Profile corrections</small><strong>{captainReviewQueue.data.pending_profile_corrections.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_documents !== null && <button className="dashboard-metric" onClick={() => setActiveSection('documents')}><span className="dashboard-metric-icon orange"><FileText size={19} /></span><span><small>Document requests</small><strong>{captainReviewQueue.data.pending_documents.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_finance !== null && <button className="dashboard-metric" onClick={() => setActiveSection('finance')}><span className="dashboard-metric-icon violet"><WalletCards size={19} /></span><span><small>Finance items to review</small><strong>{captainReviewQueue.data.pending_finance.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_health_schedules !== null && <button className="dashboard-metric" onClick={() => setActiveSection('health-outreach')}><span className="dashboard-metric-icon blue"><HeartHandshake size={19} /></span><span><small>Health schedules</small><strong>{captainReviewQueue.data.pending_health_schedules.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_sk_events !== null && <button className="dashboard-metric" onClick={() => setActiveSection('sk-events')}><span className="dashboard-metric-icon violet"><CalendarDays size={19} /></span><span><small>SK event proposals</small><strong>{captainReviewQueue.data.pending_sk_events.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_sk_projects !== null && <button className="dashboard-metric" onClick={() => setActiveSection('sk-projects')}><span className="dashboard-metric-icon blue"><FolderKanban size={19} /></span><span><small>SK project proposals</small><strong>{captainReviewQueue.data.pending_sk_projects.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_sk_accomplishments !== null && <button className="dashboard-metric" onClick={() => setActiveSection('sk-accomplishments')}><span className="dashboard-metric-icon green"><Award size={19} /></span><span><small>SK accomplishment summaries</small><strong>{captainReviewQueue.data.pending_sk_accomplishments.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.open_incidents !== null && <button className="dashboard-metric" onClick={() => setActiveSection('incidents')}><span className="dashboard-metric-icon orange"><AlertTriangle size={19} /></span><span><small>Open incidents</small><strong>{captainReviewQueue.data.open_incidents.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_referrals != null && <button className="dashboard-metric" onClick={() => setActiveSection('referrals')}><span className="dashboard-metric-icon blue"><ArrowLeftRight size={19} /></span><span><small>Referrals to review</small><strong>{captainReviewQueue.data.pending_referrals.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_invitations != null && <button className="dashboard-metric" onClick={() => setActiveSection('invitations')}><span className="dashboard-metric-icon green"><UserPlus size={19} /></span><span><small>Invitations awaiting acceptance</small><strong>{captainReviewQueue.data.pending_invitations.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {captainReviewQueue.data.pending_meeting_resolutions != null && <button className="dashboard-metric" onClick={() => setActiveSection('meetings')}><span className="dashboard-metric-icon blue"><CalendarDays size={19} /></span><span><small>Meeting resolutions to approve</small><strong>{captainReviewQueue.data.pending_meeting_resolutions.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            </div>}
          </section>}
          {membership.role?.key === 'secretary' && <section className="captain-review-queue" aria-labelledby="secretary-review-queue-title">
            <div className="section-heading"><div><h2 id="secretary-review-queue-title">Secretary work queue</h2><p>Pending records you can review in this barangay.</p></div><span className="role-pill">Private summary</span></div>
            {secretaryReviewQueue.isPending && <div className="dashboard-metrics-loading" role="status">Loading your work queue…</div>}
            {secretaryReviewQueue.error && <div className="error-banner" role="alert">Your work queue could not be loaded. Open each workspace to check its queue.</div>}
            {secretaryReviewQueue.data && <div className="dashboard-metrics captain-review-metrics" aria-label="Secretary work queue totals">
              {secretaryReviewQueue.data.pending_residency_verifications !== null && <button className="dashboard-metric" onClick={() => setActiveSection('residents')}><span className="dashboard-metric-icon green"><Users size={19} /></span><span><small>Residency checks</small><strong>{secretaryReviewQueue.data.pending_residency_verifications.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {secretaryReviewQueue.data.pending_profile_corrections !== null && <button className="dashboard-metric" onClick={() => setActiveSection('residents')}><span className="dashboard-metric-icon blue"><ShieldCheck size={19} /></span><span><small>Profile corrections</small><strong>{secretaryReviewQueue.data.pending_profile_corrections.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {secretaryReviewQueue.data.pending_documents !== null && <button className="dashboard-metric" onClick={() => setActiveSection('documents')}><span className="dashboard-metric-icon orange"><FileText size={19} /></span><span><small>Document requests</small><strong>{secretaryReviewQueue.data.pending_documents.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {secretaryReviewQueue.data.pending_meeting_resolutions !== null && <button className="dashboard-metric" onClick={() => setActiveSection('meetings')}><span className="dashboard-metric-icon violet"><FileCheck2 size={19} /></span><span><small>Resolutions to approve</small><strong>{secretaryReviewQueue.data.pending_meeting_resolutions.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {secretaryReviewQueue.data.meeting_minutes_to_review !== null && <button className="dashboard-metric" onClick={() => setActiveSection('meetings')}><span className="dashboard-metric-icon blue"><CalendarDays size={19} /></span><span><small>Minutes awaiting review</small><strong>{secretaryReviewQueue.data.meeting_minutes_to_review.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            </div>}
          </section>}
          {membership.role?.key === 'treasurer' && <section className="captain-review-queue" aria-labelledby="treasurer-follow-up-title">
            <div className="section-heading"><div><h2 id="treasurer-follow-up-title">Treasurer submission follow-up</h2><p>Your finance items still awaiting Captain review.</p></div><span className="role-pill">Private summary</span></div>
            {treasurerFollowUp.isPending && <div className="dashboard-metrics-loading" role="status">Loading finance follow-up…</div>}
            {treasurerFollowUp.error && <div className="error-banner" role="alert">Your finance follow-up could not be loaded. Open Finance to check your submissions.</div>}
            {treasurerFollowUp.data && <div className="dashboard-metrics captain-review-metrics" aria-label="Treasurer submission follow-up totals">
              {treasurerFollowUp.data.budgets_awaiting_approval !== null && <button className="dashboard-metric" onClick={() => setActiveSection('finance')}><span className="dashboard-metric-icon violet"><WalletCards size={19} /></span><span><small>Budgets awaiting approval</small><strong>{treasurerFollowUp.data.budgets_awaiting_approval.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {treasurerFollowUp.data.transactions_awaiting_review !== null && <button className="dashboard-metric" onClick={() => setActiveSection('finance')}><span className="dashboard-metric-icon blue"><FileText size={19} /></span><span><small>Transactions under review</small><strong>{treasurerFollowUp.data.transactions_awaiting_review.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {treasurerFollowUp.data.budget_changes_awaiting_review !== null && <button className="dashboard-metric" onClick={() => setActiveSection('finance')}><span className="dashboard-metric-icon orange"><CircleDollarSign size={19} /></span><span><small>Budget changes pending</small><strong>{treasurerFollowUp.data.budget_changes_awaiting_review.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {treasurerFollowUp.data.transaction_changes_awaiting_review !== null && <button className="dashboard-metric" onClick={() => setActiveSection('finance')}><span className="dashboard-metric-icon green"><ClipboardList size={19} /></span><span><small>Transaction changes pending</small><strong>{treasurerFollowUp.data.transaction_changes_awaiting_review.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            </div>}
          </section>}
          {membership.role?.key === 'kagawad' && <section className="captain-review-queue" aria-labelledby="kagawad-action-items-title">
            <div className="section-heading"><div><h2 id="kagawad-action-items-title">Your committee action items</h2><p>Tasks assigned to you in active committee workspaces.</p></div><span className="role-pill">Private summary</span></div>
            {kagawadActionItems.isPending && <div className="dashboard-metrics-loading" role="status">Loading your action items…</div>}
            {kagawadActionItems.error && <div className="error-banner" role="alert">Your action items could not be loaded. Open Committees to check your assignments.</div>}
            {kagawadActionItems.data && <div className="dashboard-metrics captain-review-metrics" aria-label="Kagawad action item totals">
              {kagawadActionItems.data.open_action_items !== null && <button className="dashboard-metric" onClick={() => setActiveSection('committees')}><span className="dashboard-metric-icon blue"><ClipboardList size={19} /></span><span><small>Open tasks</small><strong>{kagawadActionItems.data.open_action_items.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {kagawadActionItems.data.in_progress_action_items !== null && <button className="dashboard-metric" onClick={() => setActiveSection('committees')}><span className="dashboard-metric-icon violet"><Activity size={19} /></span><span><small>In progress</small><strong>{kagawadActionItems.data.in_progress_action_items.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {kagawadActionItems.data.blocked_action_items !== null && <button className="dashboard-metric" onClick={() => setActiveSection('committees')}><span className="dashboard-metric-icon orange"><AlertTriangle size={19} /></span><span><small>Blocked</small><strong>{kagawadActionItems.data.blocked_action_items.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
              {kagawadActionItems.data.overdue_action_items !== null && <button className="dashboard-metric" onClick={() => setActiveSection('committees')}><span className="dashboard-metric-icon orange"><Clock3 size={19} /></span><span><small>Overdue</small><strong>{kagawadActionItems.data.overdue_action_items.toLocaleString()}</strong></span><ArrowRight size={16} /></button>}
            </div>}
          </section>}
          <div className="section-heading"><div><h2>Your workspace</h2><p>Tools available to your account</p></div><span className="role-pill">{membership.role?.label ?? 'Member'}</span></div>
          <div className="module-grid">{visibleNav.some((item) => item.section === 'residents') && <button className="module-card" onClick={() => setActiveSection('residents')}><div className="module-icon green"><Users size={20} /></div><div><strong>Resident records</strong><p>Permission-controlled resident services</p></div><ArrowRight size={17} className="module-arrow" /></button>}{visibleNav.some((item) => item.section === 'documents') && <button className="module-card" onClick={() => setActiveSection('documents')}><div className="module-icon orange"><FileText size={20} /></div><div><strong>Document services</strong><p>Requests, approvals, and releases</p></div><ArrowRight size={17} className="module-arrow" /></button>}{visibleNav.some((item) => item.section === 'meetings') && <button className="module-card" onClick={() => setActiveSection('meetings')}><div className="module-icon blue"><CalendarDays size={20} /></div><div><strong>Meetings & attendance</strong><p>Agendas and meeting records</p></div><ArrowRight size={17} className="module-arrow" /></button>}{visibleNav.some((item) => item.section === 'announcements') && <button className="module-card" onClick={() => setActiveSection('announcements')}><div className="module-icon violet"><Activity size={20} /></div><div><strong>Community updates</strong><p>Announcements and local notices</p></div><ArrowRight size={17} className="module-arrow" /></button>}{visibleNav.some((item) => item.section === 'archive') && <button className="module-card" onClick={() => setActiveSection('archive')}><div className="module-icon green"><Archive size={20} /></div><div><strong>Barangay archive</strong><p>Private files and searchable records</p></div><ArrowRight size={17} className="module-arrow" /></button>}</div>
          {canReadCommunityCalendar && <section className="workspace-upcoming" aria-labelledby="workspace-upcoming-title"><div className="workspace-upcoming-heading"><div><h2 id="workspace-upcoming-title">Coming up</h2><p>Upcoming published SK and health outreach schedules</p></div><button type="button" className="text-action" onClick={() => openTool('community-calendar')}>Open calendar <ArrowRight size={15} /></button></div>
            {upcomingEvents.isPending && <p className="workspace-upcoming-state" role="status">Loading upcoming events...</p>}
            {upcomingEvents.error && <p className="workspace-upcoming-state error" role="alert">Upcoming events could not be loaded. Open the community calendar to retry.</p>}
            {upcomingEvents.data?.length === 0 && !upcomingEvents.isPending && !upcomingEvents.error && <p className="workspace-upcoming-state">There are no upcoming published community schedules.</p>}
            {upcomingEvents.data && <div className="workspace-upcoming-list">{upcomingEvents.data.slice(0, 3).map((event) => <button type="button" className="workspace-upcoming-item" key={`${event.source}-${event.id}`} onClick={() => openTool('community-calendar')}><span className={`workspace-upcoming-type ${event.source}`}>{event.source === 'sk' ? 'SK program' : 'Health outreach'}</span><strong>{event.title}</strong><time dateTime={event.starts_at}>{new Date(event.starts_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>{event.location && <small>{event.location}</small>}</button>)}</div>}
          </section>}
          <div className="lower-grid"><section className="panel"><div className="panel-head"><div><h2>Getting started</h2><p>Your administrator will guide your setup</p></div><BookOpen size={19} /></div><div className="getting-started"><div className="step"><span className="step-number done"><CheckCircle2 size={15} /></span><div><strong>Secure account access</strong><p>You're signed in with your invited account.</p></div><span className="complete-label">COMPLETE</span></div><div className="step"><span className="step-number">2</span><div><strong>Confirm your assigned role</strong><p>Contact your workspace administrator if it looks incorrect.</p></div></div><div className="step"><span className="step-number">3</span><div><strong>Explore your available tools</strong><p>Only features allowed for your role will be enabled.</p></div></div></div></section><section className="panel help-panel"><div className="help-art"><div className="help-orbit"><HeartHandshake size={30} /></div><span className="spark spark-a"></span><span className="spark spark-b"></span><span className="spark spark-c"></span></div><div className="help-copy"><div className="eyebrow">HERE TO HELP</div><h2>Building a stronger community, together.</h2><p>Need help accessing your workspace? Reach out to your barangay administrator.</p><button type="button" className="help-link" onClick={() => openTool('support')}>Open help & support <ArrowRight size={15} /></button></div></section></div>
        </>}
        <footer className="footer"><span>© 2026 KABALIKAT by ArkByte Technologies</span><span><ShieldCheck size={14} /> Private, secure community workspace</span></footer>
      </div>
    </main>
    <nav className="mobile-shortcut-bar" aria-label="Mobile quick navigation">
      <button type="button" className={`mobile-shortcut ${activeSection === 'overview' ? 'active' : ''}`} aria-current={activeSection === 'overview' ? 'page' : undefined} onClick={() => openTool('overview')}><LayoutDashboard size={19} /><span>Home</span></button>
      {mobileShortcuts.map(({ section, shortLabel, icon: Icon }) => <button key={section} type="button" className={`mobile-shortcut ${activeSection === section ? 'active' : ''}`} aria-current={activeSection === section ? 'page' : undefined} onClick={() => openTool(section)}><Icon size={19} /><span>{shortLabel}</span></button>)}
      <button ref={menuButtonRef} type="button" className={`mobile-shortcut ${menuOpen || (activeSection !== 'overview' && !mobileShortcuts.some((item) => item.section === activeSection)) ? 'active' : ''}`} aria-label="More workspace tools" aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(true)}><Menu size={19} /><span>More</span></button>
    </nav>    {updatesOpen && <div className="tool-finder-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setUpdatesOpen(false) }}><section ref={updatesDialogFocus.dialogRef} tabIndex={-1} className="community-updates-dialog" role="dialog" aria-modal="true" aria-labelledby="community-updates-title" onKeyDown={(event) => { updatesDialogFocus.handleDialogKeyDown(event); if (event.key === 'Escape') setUpdatesOpen(false) }}><header><div className="account-security-icon"><Bell size={19} /></div><div><h2 id="community-updates-title">Community updates</h2><p>Announcements, disaster advisories, meeting changes, announcements, advisories, meeting updates, health outreach and SK event updates and review requests, Captain feedback, and resident service decisions.</p></div>{(unreadCount ?? unreadNotifications.length) > 0 && <button type="button" className="mark-updates-read" onClick={() => void markAllCommunityUpdatesRead()}>Mark all read</button>}<button type="button" className="icon-button" aria-label="Close community updates" onClick={() => setUpdatesOpen(false)}><X size={17} /></button></header>{notificationActionError && <div className="account-security-error updates-error" role="alert">{notificationActionError}</div>}{(announcements.isPending || advisories.isPending || notifications.isPending || meetingResolutionDetails.isFetching || healthOutreachDetails.isFetching || healthOutreachRescheduleDetails.isFetching || healthReviewDetails.isFetching || healthReviewSubmissionDetails.isFetching || skReviewSubmissionDetails.isFetching || skPublicationDetails.isFetching || skCompletionDetails.isFetching || skReviewFeedbackDetails.isFetching || skCancellationDetails.isFetching || skRescheduleDetails.isFetching) && <div className="ops-loading" role="status">Loading updates...</div>}{(announcements.error || advisories.error || notifications.error || unreadNotificationCount.error || meetingResolutionDetails.error || healthOutreachDetails.error || healthOutreachRescheduleDetails.error || healthReviewDetails.error || healthReviewSubmissionDetails.error || skReviewSubmissionDetails.error || skPublicationDetails.error || skCompletionDetails.error || skReviewFeedbackDetails.error || skCancellationDetails.error || skRescheduleDetails.error) && <div className="account-security-error updates-error" role="alert">Some updates could not be loaded. Access remains controlled by your barangay permissions.</div>}{!announcements.isPending && !advisories.isPending && !notifications.isPending && !meetingResolutionDetails.isFetching && !healthOutreachDetails.isFetching && !healthOutreachRescheduleDetails.isFetching && !healthReviewDetails.isFetching && !healthReviewSubmissionDetails.isFetching && !skReviewSubmissionDetails.isFetching && !skPublicationDetails.isFetching && !skCompletionDetails.isFetching && !skReviewFeedbackDetails.isFetching && !skCancellationDetails.isFetching && !skRescheduleDetails.isFetching && currentUpdates.length === 0 && <div className="tool-finder-empty updates-empty">No current updates or service decisions.</div>}{currentUpdates.length > 0 && <div className="community-updates-list">{currentUpdates.map((item) => { const notification = notificationRows.find((entry) => entry.resource_type === item.resourceType && entry.resource_id === item.id); const unread = Boolean(notification && !notification.read_at); return <button type="button" className={`community-update-item ${unread ? 'unread' : ''}`} key={`${item.kind}-${item.id}`} onClick={() => void openCommunityUpdate(item)}><span className="community-update-type">{item.kind}{unread && <span className="community-update-new">NEW</span>}</span><strong>{item.title}</strong>{'changedSummary' in item && item.changedSummary && <span className="community-update-reason">Changed: {item.changedSummary}</span>}{'meetingSchedule' in item && item.meetingSchedule && <span className="community-update-reason">New time: {item.meetingSchedule}</span>}{'meetingLocation' in item && item.meetingLocation && <span className="community-update-reason">New location: {item.meetingLocation}</span>}{'previousSchedule' in item && item.previousSchedule && <span className="community-update-reason">{item.previousSchedule}</span>}{'reason' in item && item.reason && <span className="community-update-reason">Reason: {item.reason}</span>}<time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time></button>})}</div>}{announcements.hasNextPage && <button type="button" className="community-updates-load-more" disabled={announcements.isFetchingNextPage} onClick={() => void announcements.fetchNextPage()}>{announcements.isFetchingNextPage ? 'Loading announcements...' : `Load older announcements (${announcements.data?.pages.reduce((total, page) => total + page.announcements.length, 0) ?? 0} of ${announcements.data?.pages.slice(-1)[0]?.totalCount ?? 0})`}</button>}{advisories.hasNextPage && <button type="button" className="community-updates-load-more" disabled={advisories.isFetchingNextPage} onClick={() => void advisories.fetchNextPage()}>{advisories.isFetchingNextPage ? 'Loading advisories...' : `Load older advisories (${advisories.data?.pages.reduce((total, page) => total + page.advisories.length, 0) ?? 0} of ${advisories.data?.pages.slice(-1)[0]?.totalCount ?? 0})`}</button>}{notifications.hasNextPage && <button type="button" className="community-updates-load-more" disabled={notifications.isFetchingNextPage} onClick={() => void notifications.fetchNextPage()}>{notifications.isFetchingNextPage ? 'Loading older updates...' : `Load older updates (${notificationRows.length} of ${notifications.data?.pages.slice(-1)[0]?.totalCount ?? notificationRows.length})`}</button>}<p className="tool-finder-note">Only updates and review notes you are authorized to see are shown. External email and SMS delivery are not configured.</p></section></div>}
    {toolFinderOpen && <div className="tool-finder-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeToolFinder() }}><section ref={toolFinderFocus.dialogRef} tabIndex={-1} className="tool-finder" role="dialog" aria-modal="true" aria-labelledby="tool-finder-title" onKeyDown={(event) => { toolFinderFocus.handleDialogKeyDown(event); if (event.key === 'Escape') closeToolFinder() }}><div className="tool-finder-search"><Search size={19} /><input value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && filteredTools[0]) openTool(filteredTools[0].section) }} placeholder="Find a workspace tool..." aria-label="Search available workspace tools" /><kbd>ESC</kbd><button type="button" className="icon-button" aria-label="Close tool finder" onClick={closeToolFinder}><X size={17} /></button></div><div className="tool-finder-results"><h2 id="tool-finder-title">Available tools</h2>{filteredTools.length ? filteredTools.map(({ label, section, icon: Icon }) => <button key={label} type="button" className="tool-finder-item" onClick={() => openTool(section)}><Icon size={18} /><span>{label}</span><ArrowRight size={15} /></button>) : <p className="tool-finder-empty">No matching tools are available for your account.</p>}</div><p className="tool-finder-note">Only tools available to your assigned role are listed.</p></section></div>}
    {accountSecurityOpen && <AccountSecurityDialog email={user.email ?? ''} userId={user.id} tenantId={membership?.barangay_id ?? null} onClose={() => setAccountSecurityOpen(false)} />}
    {logoutConfirmOpen && <LogoutConfirmationDialog onCancel={() => setLogoutConfirmOpen(false)} onConfirm={() => void logout()} />}
  </div>
}

export function App() {
  const { loading, isPlatformAdmin, user } = useAuth()
  if (loading) return <div className="center-state"><span className="spinner" />Loading KABALIKAT...</div>
  const home = isPlatformAdmin ? <Navigate to="/platform" replace /> : user ? <Workspace /> : <LandingPage />
  return <Routes><Route path="/" element={home} /><Route path="/sign-in" element={<SignIn />} /><Route path="/reset-password" element={<PasswordRecoveryPage />} /><Route path="/accept-invitation" element={<AcceptInvitationPage />} /><Route path="/attendance/check-in" element={<AttendanceQrCheckInPage />} /><Route path="/verify-document" element={<PublicDocumentVerificationPage />} /><Route path="/platform" element={isPlatformAdmin ? <PlatformWorkspace /> : <Navigate to="/" replace />} /><Route path="*" element={home} /></Routes>
}
