import { ArrowRight, Bell, BookOpen, Building2, CheckCircle2, ClipboardList, FileText, HeartHandshake, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import './landing.css'

const features = [
  { icon: Bell, title: 'Community updates', text: 'Share barangay announcements and keep residents informed about services and activities.' },
  { icon: ClipboardList, title: 'Resident services', text: 'Organize service requests, meetings, attendance, and incident reports in one workspace.' },
  { icon: FileText, title: 'Records and finance', text: 'Keep authorized records, documents, budgets, and financial activity easier to review.' },
  { icon: UsersRound, title: 'Clear responsibilities', text: 'Give residents, staff, and officials tools that match their role and barangay.' },
]

export function LandingPage() {
  return <div className="landing-page">
    <header className="landing-nav">
      <a className="landing-brand" href="#home" aria-label="KABALIKAT home"><span className="landing-brand-mark"><HeartHandshake size={21} /></span><span><strong>KABALIKAT</strong><small>BY ARKBYTE TECHNOLOGIES</small></span></a>
      <nav aria-label="Main navigation"><a href="#features">What it does</a><a href="#plans">Plans</a><a href="#how-it-works">Getting started</a><a href="#privacy">Data privacy</a></nav>
      <Link className="landing-nav-cta" to="/sign-in">Sign in <ArrowRight size={16} /></Link>
    </header>

    <main>
      <section className="landing-hero" id="home">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow"><Building2 size={15} /> A connected workspace for barangays</span>
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

      <section className="landing-audience"><div><strong>Made for the whole community</strong><span>Clear, accessible tools for residents, barangay teams, and local officials.</span></div><div className="audience-tags"><span>Residents</span><span>Barangay staff</span><span>Local officials</span></div></section>

      <section className="landing-section" id="features">
        <div className="landing-section-heading"><span className="landing-eyebrow">A more organized way to serve</span><h2>Everyday barangay work, brought together.</h2><p>Find essential community and administrative tools in one place, with access shaped by responsibilities.</p></div>
        <div className="landing-feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="landing-feature" key={title}><span className="feature-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        <p className="landing-feature-footnote">The available tools depend on your barangay’s setup and your assigned role. Some capabilities may still be under development.</p>
      </section>

      <section className="landing-plans" id="plans"><div className="landing-section-heading"><span className="landing-eyebrow">Plans for every community</span><h2>Choose the right fit for your barangay.</h2><p>Plan options currently available in the KABALIKAT catalog.</p></div><div className="landing-plan-grid"><article className="landing-plan"><span className="plan-label">GET STARTED</span><h3>Free</h3><p>Base plan for a barangay starting to organize its community workspace.</p><Link to="/sign-in">Sign in <ArrowRight size={15} /></Link></article><article className="landing-plan landing-plan-featured"><span className="plan-label">GROWING COMMUNITIES</span><h3>Pro</h3><p>A paid plan option for barangays that need a plan suited to their growing operations.</p><Link to="/sign-in">Ask your administrator <ArrowRight size={15} /></Link></article><article className="landing-plan"><span className="plan-label">LARGER ORGANIZATIONS</span><h3>Enterprise / LGU</h3><p>An organization plan option for local government units and multi-community needs.</p><Link to="/sign-in">Contact your administrator <ArrowRight size={15} /></Link></article></div><p className="landing-plan-note">Pricing and included features have not been configured yet. Subscription records are managed by an administrator; online payments and plan-based feature access are not currently enabled.</p></section>

      <section className="landing-how" id="how-it-works"><div className="landing-section-heading"><span className="landing-eyebrow">Getting started</span><h2>Your barangay workspace is ready when you are.</h2><p>Access is provided by invitation so each account can be connected to the right community and responsibilities.</p></div><div className="landing-steps"><article><span>01</span><div><h3>Receive an invitation</h3><p>Ask your barangay office or administrator how to get access.</p></div></article><article><span>02</span><div><h3>Sign in securely</h3><p>Use the account linked to your invitation to open your workspace.</p></div></article><article><span>03</span><div><h3>Use your assigned tools</h3><p>Your role determines which records and actions are available to you.</p></div></article></div></section>

      <section className="landing-privacy" id="privacy"><div className="privacy-heading"><span className="privacy-shield"><LockKeyhole size={23} /></span><span className="landing-eyebrow">Your information matters</span><h2>Data privacy, in plain language.</h2><p>KABALIKAT is designed to keep community work organized while limiting access to the people who need it for their assigned responsibilities.</p></div>
        <div className="privacy-grid">
          <article><h3>Information the workspace may contain</h3><p>Depending on the services enabled, this can include account and role details, resident or household information, service requests, attendance, announcements, official documents, finance records, incident reports, and support conversations.</p></article>
          <article><h3>Why information is used</h3><p>Information supports barangay services and administration: responding to requests, coordinating community work, maintaining records, managing authorized finances, and helping troubleshoot the platform.</p></article>
          <article><h3>Who can access it</h3><p>Access depends on your account, barangay, and assigned role. Resident incident reports are available to the resident and the officials responsible for reviewing or handling them. Support staff can see information sent through the support channel.</p></article>
          <article><h3>How access is protected</h3><p>The platform uses authenticated accounts, role and barangay-based database access controls, private file storage, and activity records for important changes. No online service can promise that information is risk-free.</p></article>
          <article><h3>Service providers and sharing</h3><p>Supabase provides authentication, database, and file storage services for configured deployments. Information may be shared with people who need it to perform their authorized duties. The responsible barangay and operator should disclose any additional providers they configure.</p></article>
          <article><h3>Retention and your choices</h3><p>Barangay records should follow the retention rules set by the responsible office. There is no single retention period described here. For access, correction, or privacy questions, contact your barangay office or the service operator for your deployment.</p></article>
        </div>
        <aside className="privacy-note"><ShieldCheck size={18} /><p><strong>Privacy notice:</strong> This is a summary of the product’s current design, not a complete legal privacy notice. Before collecting real personal information, the responsible barangay and platform operator should publish their contact details, purposes, lawful basis, retention periods, and any deployment-specific disclosures.</p></aside>
      </section>

      <section className="landing-final-cta"><div><span className="landing-eyebrow">KABALIKAT · BY ARKBYTE TECHNOLOGIES</span><h2>Let’s make community service more connected.</h2><p>Already have an account or invitation? Continue to your workspace.</p></div><Link className="landing-primary" to="/sign-in">Sign in to KABALIKAT <ArrowRight size={17} /></Link></section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="#home"><span className="landing-brand-mark"><HeartHandshake size={19} /></span><span><strong>KABALIKAT</strong><small>BY ARKBYTE TECHNOLOGIES</small></span></a><span>Community and operations in one place.</span><nav aria-label="Footer navigation"><a href="#features">Platform</a><a href="#plans">Plans</a><a href="#privacy">Data privacy</a><Link to="/sign-in">Sign in</Link></nav><small>© {new Date().getFullYear()} ArkByte Technologies</small></footer>
  </div>
}
