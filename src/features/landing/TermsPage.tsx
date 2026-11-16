import { ArrowLeft, HeartHandshake } from 'lucide-react'
import { Link } from 'react-router-dom'

export function TermsPage() {
  return <main className="auth-page legal-page">
    <div className="auth-brand"><div className="brand-mark"><HeartHandshake size={24} /></div><span>KABALIKAT</span></div>
    <article className="auth-card legal-card">
      <Link className="auth-back-link" to="/sign-in"><ArrowLeft size={16} /> Back to sign in</Link>
      <div className="eyebrow">KABALIKAT</div>
      <h1>Terms and Conditions</h1>
      <p className="muted">These terms explain the basic rules for using the KABALIKAT web application.</p>
      <div className="legal-content">
        <section><h2>1. Using the service</h2><p>KABALIKAT provides digital tools for barangay and local government operations. Use the service only if you are authorized to access the account and workspace assigned to you. Your role and workspace determine which information and actions are available.</p></section>
        <section><h2>2. Account security</h2><p>Keep your password and sign-in links private. You are responsible for activity performed through your account. Notify your barangay administrator or KABALIKAT support promptly if you believe an account has been accessed without permission.</p></section>
        <section><h2>3. Appropriate use and records</h2><p>Use KABALIKAT for legitimate community and administrative work. Do not attempt to access another workspace, bypass permissions, disrupt the service, upload malicious content, or submit information you are not authorized to share. Make sure submitted records are accurate and appropriate for the service.</p></section>
        <section><h2>4. Incident reports are not emergency dispatch</h2><p>Incident and disaster reports help barangay and municipal teams coordinate. KABALIKAT is not an emergency hotline and does not guarantee immediate monitoring or response. For immediate danger, contact local emergency services or officials directly.</p></section>
        <section><h2>5. Subscriptions and availability</h2><p>Subscription plans, fees, billing periods, and activation are shown in the applicable workspace or plan request. An LGU and its barangays may have separate subscriptions. Features may depend on the active plan. The service may be updated or temporarily unavailable for maintenance, security, or operational reasons.</p></section>
        <section><h2>6. Privacy</h2><p>Personal information is handled as described in the <Link to="/privacy">Data Privacy Policy</Link> and any workspace-specific notice provided by the responsible barangay or LGU. Follow your organization’s policies when accessing or sharing community records.</p></section>
        <section><h2>7. Suspension and account removal</h2><p>Access may be limited or removed when an account is no longer authorized, a subscription or workspace is inactive, or these terms are materially violated. Official records may be retained or anonymized as required by the responsible organization’s retention rules and applicable law.</p></section>
        <section><h2>8. Changes and contact</h2><p>These terms may change as the service evolves. Continued use after updated terms are posted means you accept the updated terms where permitted by law. For platform questions, contact <a href="mailto:kabalikatph2026@gmail.com">kabalikatph2026@gmail.com</a>.</p></section>
      </div>
    </article>
    <p className="auth-caption">One Barangay. One Connected Community.</p>
  </main>
}
