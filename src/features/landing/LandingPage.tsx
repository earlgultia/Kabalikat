import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Bell, BookOpen, Building2, CheckCircle2, ChevronDown, ClipboardList, Eye, Facebook, FileText, HeartHandshake, LockKeyhole, Mail, Phone, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getPublicSiteVisitorId, getPublicSiteVisitorMetrics, isSiteAnalyticsOptedOut, publicSiteSections, setSiteAnalyticsOptOut, siteAnalyticsOptOutStorageKey, trackPublicSiteHeartbeat, trackPublicSitePageView, type PublicSiteSection, type PublicVisitorMetrics } from './visitor-analytics'
import './landing.css'

const features = [
  { icon: Bell, title: 'Community updates', text: 'Share barangay announcements and keep residents informed about services and activities.' },
  { icon: ClipboardList, title: 'Resident services', text: 'Organize service requests, meetings, attendance, and incident reports in one workspace.' },
  { icon: FileText, title: 'Records and finance', text: 'Keep authorized records, documents, budgets, and financial activity easier to review.' },
  { icon: UsersRound, title: 'Clear responsibilities', text: 'Give residents, staff, and officials tools that match their role and barangay.' },
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

  function updateAnalyticsPreference(optedOut: boolean) {
    setSiteAnalyticsOptOut(optedOut)
    setAnalyticsOptedOut(optedOut)
    if (optedOut) setVisitorMetrics(null)
  }

  return <div className="landing-page">
    <a className="skip-link" href="#landing-main">Skip to main content</a>
    <header className="landing-nav">
      <a className="landing-brand" href="#home" aria-label="KABALIKAT home"><span className="landing-brand-mark"><HeartHandshake size={21} /></span><span><strong>KABALIKAT</strong><small>BY ARKBYTE TECHNOLOGIES</small></span></a>
      <nav aria-label="Main navigation"><a href="#features">What it does</a><a href="#plans">Plans</a><a href="#how-it-works">Getting started</a><a href="#privacy">Data privacy</a></nav>
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
          <p>KABALIKAT brings community updates, resident services, records, and day-to-day operations into one organized digital workspace.</p>
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
        <div className="landing-section-heading"><span className="landing-eyebrow">Plans for every community</span><h2>Choose the right fit for your barangay.</h2><p>Captains can request a plan from their workspace.</p></div>
        <div className="landing-plan-grid">
          <article className="landing-plan"><span className="plan-label">GET STARTED</span><h3>Free</h3><div className="landing-plan-price">₱0 <span>for 7 days</span></div><p>Try KABALIKAT with a 7-day free trial for your barangay workspace.</p><Link to="/sign-in">Sign in <ArrowRight size={15} /></Link></article>
          <article className="landing-plan landing-plan-featured"><span className="plan-label">GROWING COMMUNITIES</span><h3>Pro</h3><div className="landing-plan-price">₱1,000 <span>per month</span></div><p>For barangays that need a plan suited to their growing operations.</p><Link to="/sign-in">Request Pro <ArrowRight size={15} /></Link></article>
          <article className="landing-plan"><span className="plan-label">LOCAL GOVERNMENT</span><h3>LGU</h3><div className="landing-plan-price">₱2,500 <span>per month</span></div><p>For local government units and larger community operations.</p><Link to="/sign-in">Request LGU <ArrowRight size={15} /></Link></article>
        </div>
        <p className="landing-plan-note">Pro and LGU prices are monthly and shown in Philippine pesos. Payment arrangement and activation are handled directly with ArkByte. There is no online checkout: Captains submit a plan request, and the Super Admin activates the plan after confirming payment.</p>
      </section>

      <section className="landing-how" id="how-it-works"><div className="landing-section-heading"><span className="landing-eyebrow">Getting started</span><h2>Your barangay workspace is ready when you are.</h2><p>Access is provided by invitation so each account can be connected to the right community and responsibilities.</p></div><div className="landing-steps"><article><span>01</span><div><h3>Receive an invitation</h3><p>Ask your barangay office or administrator how to get access.</p></div></article><article><span>02</span><div><h3>Sign in securely</h3><p>Use the account linked to your invitation to open your workspace.</p></div></article><article><span>03</span><div><h3>Use your assigned tools</h3><p>Your role determines which records and actions are available to you.</p></div></article></div></section>

      <section className="landing-privacy" id="privacy"><div className="privacy-heading"><span className="privacy-shield"><LockKeyhole size={23} /></span><span className="landing-eyebrow">Your information matters</span><h2>Data privacy, in plain language.</h2><p>Read the KABALIKAT privacy notice and learn which organization is responsible for each type of information.</p></div>
        <div className="privacy-grid">
          <details className="privacy-card privacy-full-notice"><summary><span><strong>Full privacy notice</strong><small>KABALIKAT web app · Effective November 9, 2026</small></span><ChevronDown size={18} aria-hidden="true" /></summary>
            <div className="privacy-notice-content">
              <section><h3>1. Who is responsible</h3><p>The barangay or local government unit that decides to collect and use resident, household, service, health, attendance, finance, or other barangay records is responsible for those records and must provide its own contact details and workspace-specific notice. KABALIKAT is software operated by ArkByte Technologies. For platform account, security, public-site, or support questions, contact ArkByte at <a href="mailto:kabalikatph2026@gmail.com">kabalikatph2026@gmail.com</a> or <a href="tel:+639944462851">09944462851</a>. These contacts do not replace the responsible barangay’s privacy contact.</p></section>
              <section><h3>2. Information that may be processed</h3><p>Depending on the services your barangay enables, the system may process account identifiers and contact details; names, addresses, household and residency details; membership, role, and invitation records; service and document requests; meeting invitations, attendance, and minutes; announcements and feedback; project and committee activity; financial records; incident and emergency reports; health outreach records; uploaded archive or evidence files; support messages; and security, audit, and access logs. Some information may be sensitive personal information under Philippine law. The barangay should collect only information needed for a stated service.</p></section>
              <section><h3>3. Sources and purposes</h3><p>Information may be provided by you, an authorized representative, or authorized barangay staff acting for an official service. It is used to create and secure accounts, connect them to the right barangay and role, receive and process service requests, maintain official records, coordinate community work, provide support, investigate security incidents, and meet applicable legal or records obligations. The responsible barangay determines the specific purpose and lawful basis for each record. Depending on the activity, a basis may include a legal obligation or public function, a requested service, vital interests, consent where appropriate, or another basis allowed by the Data Privacy Act. Sensitive information is processed only when an applicable legal condition permits it.</p></section>
              <section><h3>4. How information is handled and shared</h3><p>Information is entered through the website or workspace, checked against the signed-in account and its permissions, and stored electronically. The deployment uses Supabase for authentication and database services and may use its file storage for supported uploads. The public website is hosted through Vercel. Authorized barangay officials may access records needed for their assigned duties. ArkByte support personnel may see information included in a support request or information needed to operate and secure the platform. Providers may process information in the regions configured for a deployment; the responsible organization should identify its actual hosting region, any additional providers, and any cross-border transfers in its local notice. KABALIKAT’s role-based controls reduce access, but no online service can promise zero risk.</p></section>
              <section><h3>5. Browser storage, automation, and AI</h3><p>The app uses browser storage for the sign-in session and selected workspace. AI Smart Scan is a planned feature and is not currently enabled; this codebase does not send workspace records or meeting documents to an external AI provider or make service decisions solely through automated profiling. Any future AI or automated decision feature must receive a separate privacy and security review and disclose its provider, data use, purpose, and meaningful effects before it is enabled.</p></section>
              <section><h3>6. Retention and deletion</h3><p>There is no single retention period for all KABALIKAT records. Barangay and LGU records must follow the responsible organization’s approved retention schedule and applicable laws. This codebase does not publish a uniform retention period for platform account, support, security, and audit records; the operator must state the schedule that applies to each deployment. Backups may retain deleted data until the applicable backup cycle expires. Ask the barangay responsible for a record for its exact retention and deletion schedule; deployment-specific periods should be supplied in that barangay’s notice.</p></section>
              <section><h3>7. Your rights and how to make a request</h3><p>Subject to applicable law, data subjects may ask whether their information is processed, request access and a copy, seek correction, object to processing, request erasure or blocking where permitted, seek damages where available, and exercise data portability rights where applicable. To exercise a right, contact the barangay office responsible for the record and provide enough information to verify your identity. For platform account or support data, contact ArkByte using the details above. If you cannot resolve a concern, you may contact the <a href="https://privacy.gov.ph/data-subject-rights/" target="_blank" rel="noreferrer">National Privacy Commission</a> or review <a href="https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html" target="_blank" rel="noreferrer">Republic Act No. 10173</a>.</p></section>
              <section><h3>8. Questions, complaints, and incidents</h3><p>For a barangay record, first contact the barangay or LGU identified in your workspace-specific notice. For KABALIKAT platform operations, contact <a href="mailto:kabalikatph2026@gmail.com">ArkByte Technologies</a>. If you suspect a privacy or security incident, notify the responsible barangay and ArkByte promptly. The responsible personal information controller will assess the incident and notify the NPC and affected individuals when required by law.</p></section>
              <section><h3>9. Changes and automated processing</h3><p>This notice may be updated when processing or providers change; the effective date above will be revised when it does. The current codebase does not make service decisions solely by automated profiling. Any future AI or automated decision feature must receive a separate privacy and security review and disclose its provider, data use, purpose, and meaningful effects before it is enabled. A privacy notice explains processing; it is not itself consent or a substitute for a valid legal basis.</p></section>
              <section><h3>10. Public website traffic analytics</h3><p>If you allow analytics, KABALIKAT stores a random, pseudonymous identifier in this browser to estimate distinct browser visitors and count views of public landing-page sections. It records the section key and Manila calendar day, not your name, email, account, barangay, or the page URL. A heartbeat runs while this landing page is open; a browser is counted as live for up to two minutes after its last heartbeat. The same browser identifier prevents a refresh from becoming a new unique visitor, while page refreshes are counted as page views. Browser identifiers and section/day counts are kept for aggregate traffic reporting and are separate from barangay records. The public counter shows aggregate totals only; section charts are available only to platform administrators. This identifier can be cleared with browser site data, which will make that browser appear as a new visitor.</p></section>
            </div>
          </details>
          <details className="privacy-card"><summary><span><strong>Information in the workspace</strong><small>What KABALIKAT may store</small></span><ChevronDown size={18} aria-hidden="true" /></summary><p>Depending on the services a barangay enables, information may include account and role details, resident or household records, service requests, attendance, announcements, official documents, finance records, incident reports, and support conversations. A barangay should collect only information needed for its stated services.</p></details>
          <details className="privacy-card"><summary><span><strong>Purpose and responsibility</strong><small>Why information is used</small></span><ChevronDown size={18} aria-hidden="true" /></summary><p>Information supports barangay services and administration, such as responding to requests, coordinating community work, and maintaining official records. The barangay or organization deciding why and how information is processed is responsible for explaining its purposes and lawful basis in its own privacy notice.</p></details>
          <details className="privacy-card"><summary><span><strong>Who can access records</strong><small>Role and barangay access</small></span><ChevronDown size={18} aria-hidden="true" /></summary><p>Access is intended to depend on a signed-in account, its active barangay membership, and assigned permissions. Sensitive records should be limited to authorized people handling the relevant service. Information submitted to platform support may be visible to support staff who handle that request.</p></details>
          <details className="privacy-card"><summary><span><strong>Safeguards and their limits</strong><small>How access is controlled</small></span><ChevronDown size={18} aria-hidden="true" /></summary><p>The application uses authenticated accounts and role- and barangay-based access controls. Deployment settings, account security, staff practices, and service availability also matter. No internet service can guarantee that data is completely risk-free; do not share passwords and report suspected account issues to your barangay or service operator.</p></details>
          <details className="privacy-card"><summary><span><strong>Providers and sharing</strong><small>Where information may go</small></span><ChevronDown size={18} aria-hidden="true" /></summary><p>Configured deployments use Supabase for authentication, database, and file storage services. Information may also be seen by authorized officials performing their duties. The organization operating a deployment should identify any additional providers, recipients, or data transfers in its own notice.</p></details>
          <details className="privacy-card"><summary><span><strong>Retention and your choices</strong><small>Questions, access, and correction</small></span><ChevronDown size={18} aria-hidden="true" /></summary><p>Retention periods depend on the barangay’s records rules and applicable requirements; this page does not set one universal period. For a privacy question or request to access or correct information, contact the barangay office responsible for the record. If the concern is about the platform itself, contact the service operator named in that deployment’s notice.</p></details>
        </div>
        <details className="privacy-card analytics-privacy-controls"><summary><span><strong>Public website analytics</strong><small>Choose whether this browser contributes to visitor counts</small></span><ChevronDown size={18} aria-hidden="true" /></summary><div className="analytics-privacy-body"><p>{analyticsOptedOut ? 'Analytics is off for this browser.' : 'Analytics is on for this browser. A random, pseudonymous browser identifier and public landing-page section views are used for aggregate traffic counts.'}</p><button type="button" className="analytics-preference-button" aria-pressed={!analyticsOptedOut} onClick={() => updateAnalyticsPreference(!analyticsOptedOut)}>{analyticsOptedOut ? 'Allow visitor analytics' : 'Turn off analytics'}</button></div></details>
        <aside className="privacy-note"><ShieldCheck size={20} aria-hidden="true" /><div><strong>Important: check your barangay’s notice</strong><p>This general notice cannot supply details that vary by deployment. Before you submit personal information, your barangay or LGU should identify itself and its privacy contact, explain the purpose and lawful basis, name the actual providers and recipients, and state its retention schedule and complaint process. Ask the barangay office if these details are not shown in your workspace.</p></div></aside>
        <section className="privacy-contact" aria-labelledby="privacy-contact-title">
          <div><span className="landing-eyebrow">Need help or have a question?</span><h3 id="privacy-contact-title">Contact the developers</h3><p>Reach ArkByte Technologies for platform questions or support.</p></div>
          <div className="privacy-contact-links">
            <a href="mailto:kabalikatph2026@gmail.com"><Mail size={17} aria-hidden="true" /><span><small>Email</small><strong>kabalikatph2026@gmail.com</strong></span><ArrowRight size={15} aria-hidden="true" /></a>
            <a href="tel:+639944462851"><Phone size={17} aria-hidden="true" /><span><small>Contact number</small><strong>09944462851</strong></span><ArrowRight size={15} aria-hidden="true" /></a>
            <a href="https://www.facebook.com/search/top?q=ArkByte%20Technologies" target="_blank" rel="noreferrer"><Facebook size={17} aria-hidden="true" /><span><small>Facebook</small><strong>ArkByte Technologies</strong></span><ArrowRight size={15} aria-hidden="true" /></a>
          </div>
        </section>
      </section>

      <section className="landing-final-cta"><div><span className="landing-eyebrow">KABALIKAT · BY ARKBYTE TECHNOLOGIES</span><h2>Let’s make community service more connected.</h2><p>Already have an account or invitation? Continue to your workspace.</p></div><Link className="landing-primary" to="/sign-in">Sign in to KABALIKAT <ArrowRight size={17} /></Link></section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="#home"><span className="landing-brand-mark"><HeartHandshake size={19} /></span><span><strong>KABALIKAT</strong><small>BY ARKBYTE TECHNOLOGIES</small></span></a><span>Community and operations in one place.</span><nav aria-label="Footer navigation"><a href="#features">Platform</a><a href="#plans">Plans</a><a href="#privacy">Data privacy</a><Link to="/verify-document">Verify a document</Link><Link to="/sign-in">Sign in</Link></nav><small>© {new Date().getFullYear()} ArkByte Technologies</small></footer>
    {!analyticsOptedOut && visitorMetrics && <aside className="landing-visitor-indicator" aria-label="Public website visitor statistics" aria-live="polite"><span className="visitor-indicator-icon"><Activity size={17} aria-hidden="true" /></span><span className="visitor-indicator-copy"><strong>{visitorMetrics.total_visitors.toLocaleString()} unique browsers visited KABALIKAT</strong><small><i aria-hidden="true" /> {visitorMetrics.live_visitors.toLocaleString()} currently exploring the platform</small></span><span className="visitor-indicator-today"><Eye size={14} aria-hidden="true" />Today {visitorMetrics.today_visitors.toLocaleString()}</span></aside>}
  </div>
}
