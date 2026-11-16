import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Bell, BookOpen, Building2, CheckCircle2, ClipboardList, Eye, FileText, HeartHandshake, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getPublicSiteVisitorId, getPublicSiteVisitorMetrics, isSiteAnalyticsOptedOut, publicSiteSections, siteAnalyticsOptOutStorageKey, trackPublicSiteHeartbeat, trackPublicSitePageView, type PublicSiteSection, type PublicVisitorMetrics } from './visitor-analytics'
import './landing.css'

const features = [
  { icon: Bell, title: 'Community updates', text: 'Share announcements and keep residents informed about services, meetings, and activities.' },
  { icon: ClipboardList, title: 'Incident response', text: 'Tanods can report incidents to the Captain, who decides whether the barangay can respond or the LGU should be notified.' },
  { icon: Building2, title: 'Municipal oversight', text: 'LGU teams can review reports escalated by barangays across their own municipality.' },
  { icon: UsersRound, title: 'Connected workspaces', text: 'Super Admins invite LGUs, LGUs invite barangay Captains, Captains invite Secretaries, and Secretaries invite their barangay teams.' },
]

export function LandingPage() {
  const [analyticsOptedOut, setAnalyticsOptedOut] = useState(isSiteAnalyticsOptedOut)
  const [visitorMetrics, setVisitorMetrics] = useState<PublicVisitorMetrics | null>(null)

  useEffect(() => {
    const syncAnalyticsPreference = (event: StorageEvent) => {
      if (event.key !== siteAnalyticsOptOutStorageKey && event.key !== null) return
      const optedOut = isSiteAnalyticsOptedOut()
      setAnalyticsOptedOut(optedOut)
      if (optedOut) setVisitorMetrics(null)
    }
    window.addEventListener('storage', syncAnalyticsPreference)
    return () => window.removeEventListener('storage', syncAnalyticsPreference)
  }, [])

  useEffect(() => {
    if (analyticsOptedOut || !supabase) return
    const visitorId = getPublicSiteVisitorId()
    const viewedSections = new Set<PublicSiteSection>()
    let active = true
    const track = (section: PublicSiteSection) => {
      if (viewedSections.has(section)) return
      viewedSections.add(section)
      void trackPublicSitePageView(visitorId, section).catch(() => undefined)
    }
    track('home')
    const heartbeatNow = () => {
      if (!document.hidden) void trackPublicSiteHeartbeat(visitorId).catch(() => undefined)
    }
    const heartbeat = window.setInterval(heartbeatNow, 60_000)
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && publicSiteSections.includes(entry.target.id as PublicSiteSection)) track(entry.target.id as PublicSiteSection)
      }
    }, { threshold: 0.2 })
    for (const section of publicSiteSections) {
      const element = document.getElementById(section)
      if (element) observer?.observe(element)
    }
    const refresh = () => {
      if (active && !document.hidden) void getPublicSiteVisitorMetrics().then(setVisitorMetrics).catch(() => undefined)
    }
    const handleVisibilityChange = () => {
      if (document.hidden) return
      heartbeatNow()
      refresh()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    refresh()
    // Public traffic uses lightweight polling instead of one Realtime socket
    // per anonymous visitor. The authenticated analytics dashboard retains its
    // Realtime subscription for staff who actively monitor the metrics.
    const poll = window.setInterval(refresh, 60_000)
    return () => {
      active = false
      window.clearInterval(heartbeat)
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      observer?.disconnect()
    }
  }, [analyticsOptedOut])

  return <div className="landing-page">
    <a className="skip-link" href="#landing-main">Skip to main content</a>
    <header className="landing-nav">
      <a className="landing-brand" href="#home" aria-label="KABALIKAT home"><span className="landing-brand-mark"><HeartHandshake size={21} /></span><span><strong>KABALIKAT</strong><small>BY ARKBYTE TECHNOLOGIES</small></span></a>
      <nav aria-label="Main navigation"><a href="#features">What it does</a><a href="#plans">Plans</a><a href="#how-it-works">Getting started</a></nav>
      <Link className="landing-nav-cta" to="/sign-in">Sign in <ArrowRight size={16} /></Link>
    </header>

    <main id="landing-main" tabIndex={-1}>
      <section className="landing-hero" id="home">
        <div className="landing-hero-copy">
          <div className="landing-hero-kicker">
            <a className="landing-ai-badge" href="#ai-smart-scan"><Sparkles size={16} aria-hidden="true" /> Smart Scan · coming soon</a>
            <span className="landing-eyebrow"><Building2 size={15} /> A connected workspace for barangays</span>
          </div>
          <h1>Stronger barangays start with <em>working together.</em></h1>
          <p>KABALIKAT connects residents, barangay teams, and municipal LGUs so local services and incident reports can move to the right people.</p>
          <div className="landing-actions"><Link className="landing-primary" to="/sign-in">Open your workspace <ArrowRight size={17} /></Link><a className="landing-secondary" href="#features">Explore the platform</a></div>
          <div className="landing-trust"><span><CheckCircle2 size={16} /> Barangay-specific workspaces</span><span><CheckCircle2 size={16} /> Access based on assigned roles</span></div>
        </div>
        <div className="landing-preview" aria-label="Illustration of KABALIKAT workspace modules">
          <div className="preview-top"><span className="preview-logo"><HeartHandshake size={17} /></span><div><strong>Barangay workspace</strong><small>Community and operations</small></div><span className="preview-status">Workspace</span></div>
          <div className="preview-welcome"><span className="landing-eyebrow">YOUR COMMUNITY, CONNECTED</span><h2>One place to stay organized.</h2><p>Tools for residents and barangay teams.</p></div>
          <div className="preview-list"><span><i className="preview-icon green"><Bell size={17} /></i><b>Announcements</b><small>Community updates</small><ArrowRight size={15} /></span><span><i className="preview-icon gold"><BookOpen size={17} /></i><b>Resident services</b><small>Requests and meetings</small><ArrowRight size={15} /></span><span><i className="preview-icon blue"><FileText size={17} /></i><b>Records and reports</b><small>Organized by role</small><ArrowRight size={15} /></span></div>
          <div className="preview-note"><ShieldCheck size={15} /> Access is limited by your account and assigned role.</div>
          <span className="preview-orbit orbit-one" /><span className="preview-orbit orbit-two" />
        </div>
      </section>

      <section className="landing-ai-feature" id="ai-smart-scan" aria-labelledby="landing-ai-title">
        <div className="landing-ai-feature-copy">
          <span className="landing-ai-feature-label"><Sparkles size={15} aria-hidden="true" /> Featured AI feature <span>Coming soon</span></span>
          <h2 id="landing-ai-title">AI Smart Scan</h2>
          <p>Turn paper meeting notes into clear, organized minutes. Smart Scan is being developed to help arrange key discussion points, decisions, and action items into a draft that barangay staff can review and correct.</p>
          <p className="landing-ai-feature-note"><ShieldCheck size={15} aria-hidden="true" /> Staff review stays part of the process before minutes are saved as an official record.</p>
        </div>
        <div className="landing-ai-feature-preview" aria-label="Planned AI Smart Scan minutes draft preview">
          <div className="ai-preview-header"><span><FileText size={17} aria-hidden="true" /></span><div><strong>Meeting minutes draft</strong><small>Organized for easy review</small></div><span className="ai-preview-status">Draft</span></div>
          <div className="ai-preview-section"><strong>Discussion</strong><span>Community clean-up schedule and volunteer coordination</span></div>
          <div className="ai-preview-row"><span><CheckCircle2 size={15} aria-hidden="true" />Decision</span><p>Set the clean-up for the agreed community schedule.</p></div>
          <div className="ai-preview-row"><span><ClipboardList size={15} aria-hidden="true" />Action item</span><p>Confirm supplies and share the schedule with residents.</p></div>
          <small className="ai-preview-disclaimer">Example only · planned feature · staff review required</small>
        </div>
      </section>

      <section className="landing-audience"><div><strong>Made for the whole community</strong><span>Clear, accessible tools for residents, barangay teams, and local officials.</span></div><div className="audience-tags"><span>Residents</span><span>Barangay staff</span><span>Local officials</span></div></section>

      <section className="landing-section" id="features">
        <div className="landing-section-heading"><span className="landing-eyebrow">A more organized way to serve</span><h2>Everyday barangay work, brought together.</h2><p>Find essential community and administrative tools in one place, with access shaped by responsibilities.</p></div>
        <div className="landing-feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="landing-feature" key={title}><span className="feature-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        <p className="landing-feature-footnote">The available tools depend on your barangay’s setup and your assigned role. Some capabilities may still be under development.</p>
      </section>

      <section className="landing-plans" id="plans">
        <div className="landing-section-heading"><span className="landing-eyebrow">Plans for every community</span><h2>Choose the right fit for your workspace.</h2><p>LGUs and barangays each request their own monthly subscription.</p></div>
        <div className="landing-plan-grid">
          <article className="landing-plan"><span className="plan-label">GET STARTED</span><h3>Free</h3><div className="landing-plan-price">₱0 <span>for 7 days</span></div><p>Try KABALIKAT with a 7-day free trial for your barangay workspace.</p><Link to="/sign-in">Sign in <ArrowRight size={15} /></Link></article>
          <article className="landing-plan landing-plan-featured"><span className="plan-label">GROWING COMMUNITIES</span><h3>Pro</h3><div className="landing-plan-price">₱1,000 <span>per month</span></div><p>For barangays that need a plan suited to their growing operations.</p><Link to="/sign-in">Request Pro <ArrowRight size={15} /></Link></article>
          <article className="landing-plan"><span className="plan-label">LOCAL GOVERNMENT</span><h3>LGU</h3><div className="landing-plan-price">₱2,500 <span>per month</span></div><p>For local government units and larger community operations.</p><Link to="/sign-in">Request LGU <ArrowRight size={15} /></Link></article>
        </div>
        <p className="landing-plan-note">Prices are monthly and shown in Philippine pesos. LGUs request a subscription for their municipality, and Captains request a separate subscription for each barangay workspace. The Super Admin reviews requests and activates approved plans.</p>
      </section>

      <section className="landing-how" id="how-it-works"><div className="landing-section-heading"><span className="landing-eyebrow">How KABALIKAT is organized</span><h2>From the municipality to every barangay.</h2><p>Each workspace has its own subscription, members, and role-based access.</p></div><div className="landing-steps"><article><span>01</span><div><h3>Super Admin invites an LGU</h3><p>The municipal administrator accepts an email-bound invitation to the LGU workspace.</p></div></article><article><span>02</span><div><h3>LGU creates barangays</h3><p>The LGU creates each barangay workspace and invites its Captain.</p></div></article><article><span>03</span><div><h3>Captain invites a Secretary</h3><p>Each Captain can invite the Secretary assigned to their barangay.</p></div></article><article><span>04</span><div><h3>Secretary invites the team</h3><p>The Secretary invites the Treasurer, Kagawad, SK Chairperson, Health Worker, Tanod, and Residents.</p></div></article><article><span>05</span><div><h3>Workspaces request monthly plans</h3><p>The LGU and each barangay request and maintain their own subscription.</p></div></article><article><span>06</span><div><h3>Escalate incidents when needed</h3><p>Tanods report to the Captain, who decides whether the barangay can respond or should involve the LGU.</p></div></article></div></section>

      <section className="landing-final-cta"><div><span className="landing-eyebrow">KABALIKAT · BY ARKBYTE TECHNOLOGIES</span><h2>Let’s make community service more connected.</h2><p>Already have an account or invitation? Continue to your workspace.</p></div><Link className="landing-primary" to="/sign-in">Sign in to KABALIKAT <ArrowRight size={17} /></Link></section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="#home"><span className="landing-brand-mark"><HeartHandshake size={19} /></span><span><strong>KABALIKAT</strong><small>BY ARKBYTE TECHNOLOGIES</small></span></a><span>Community and operations in one place.</span><nav aria-label="Footer navigation"><a href="#features">Platform</a><a href="#plans">Plans</a><Link to="/privacy">Data privacy</Link><Link to="/verify-document">Verify a document</Link><Link to="/sign-in">Sign in</Link></nav><small>© {new Date().getFullYear()} ArkByte Technologies</small></footer>
    {!analyticsOptedOut && visitorMetrics && <aside className="landing-visitor-indicator" aria-label="Public website visitor statistics" aria-live="polite"><span className="visitor-indicator-icon"><Activity size={17} aria-hidden="true" /></span><span className="visitor-indicator-copy"><strong>{visitorMetrics.total_visitors.toLocaleString()} unique browsers visited KABALIKAT</strong><small><i aria-hidden="true" /> {visitorMetrics.live_visitors.toLocaleString()} currently exploring the platform</small></span><span className="visitor-indicator-today"><Eye size={14} aria-hidden="true" />Today {visitorMetrics.today_visitors.toLocaleString()}</span></aside>}
  </div>
}
