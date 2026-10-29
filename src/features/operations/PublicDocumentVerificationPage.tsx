import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, FileCheck2, Search, ShieldAlert } from 'lucide-react'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'

type VerificationResult = {
  document_status: 'valid' | 'expired' | 'revoked' | 'corrected'
  document_type: string
  barangay_name: string
  issued_at: string
  expires_at: string | null
}

const verificationSchema = z.object({
  reference: z.string().trim().regex(/^[A-F0-9]{12}$/i, 'Enter the 12-character request reference.'),
  issuance: z.string().trim().regex(/^\d{4}-[A-F0-9]{8}$/i, 'Enter the issuance number in YYYY-XXXXXXXX format.'),
})

export function PublicDocumentVerificationPage() {
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setResult(null); setSearched(false)
    const form = new FormData(event.currentTarget)
    const parsed = verificationSchema.safeParse({ reference: form.get('reference'), issuance: form.get('issuance') })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check both numbers and try again.'); return }
    if (!supabase) { setError('The verification service is not configured. Please contact the barangay office.'); return }
    setBusy(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('verify_public_issued_document', {
        p_reference_number: parsed.data.reference.toUpperCase(),
        p_issuance_number: parsed.data.issuance.toUpperCase(),
      })
      if (rpcError) throw rpcError
      const rows = (data ?? []) as VerificationResult[]
      setResult(rows[0] ?? null)
      setSearched(true)
    } catch {
      setError('We could not complete the verification. Please try again later or contact the issuing barangay.')
    } finally { setBusy(false) }
  }

  const isValid = result?.document_status === 'valid'
  return <main className="public-verification-page">
    <div className="public-verification-card">
      <Link className="public-verification-back" to="/"><ArrowLeft size={16} />KABALIKAT home</Link>
      <div className="public-verification-heading"><span><FileCheck2 size={22} /></span><div><p>PUBLIC SERVICE</p><h1>Verify a barangay document</h1></div></div>
      <p className="public-verification-intro">Enter the request reference and issuance number printed on the document. Both numbers are required to confirm the record.</p>
      <form className="public-verification-form" onSubmit={(event) => void verify(event)}>
        <label>Request reference<input name="reference" required inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={12} placeholder="12-character reference" aria-describedby="verification-reference-hint" /></label>
        <small id="verification-reference-hint">Usually 12 letters or numbers.</small>
        <label>Issuance number<input name="issuance" required inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={13} placeholder="2026-1A2B3C4D" aria-describedby="verification-issuance-hint" /></label>
        <small id="verification-issuance-hint">Format: four-digit year, hyphen, eight characters.</small>
        {error && <p className="public-verification-error" role="alert">{error}</p>}
        <button className="button primary" disabled={busy}><Search size={16} />{busy ? 'Checking…' : 'Verify document'}</button>
      </form>
      {searched && !result && <section className="public-verification-result unavailable" role="status"><ShieldAlert size={22} /><div><h2>No matching record found</h2><p>Check that both numbers match the document, or contact the barangay office that issued it.</p></div></section>}
      {result && <section className={`public-verification-result ${isValid ? 'verified' : 'unavailable'}`} role="status">
        {isValid ? <CheckCircle2 size={23} /> : <ShieldAlert size={23} />}
        <div><h2>{isValid ? 'Record verified' : `Document ${result.document_status}`}</h2>
          <p>{isValid ? 'The issuing barangay has a matching record, and it is currently marked valid.' : 'The matching record is not currently valid. Contact the issuing barangay before relying on this document.'}</p>
          <dl><div><dt>Document</dt><dd>{result.document_type}</dd></div><div><dt>Issuing barangay</dt><dd>{result.barangay_name}</dd></div><div><dt>Issued</dt><dd>{new Date(result.issued_at).toLocaleDateString()}</dd></div>{result.expires_at && <div><dt>Expires</dt><dd>{new Date(result.expires_at).toLocaleDateString()}</dd></div>}</dl>
        </div>
      </section>}
      <p className="public-verification-privacy">This check does not display the document holder's personal details. Compare the name and information on the original document directly with the person presenting it.</p>
    </div>
  </main>
}
