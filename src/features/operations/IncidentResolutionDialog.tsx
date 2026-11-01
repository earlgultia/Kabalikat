import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ClipboardCheck } from 'lucide-react'

export function IncidentResolutionDialog({ status, busy, onCancel, onConfirm }: {
  status: 'resolved' | 'closed'
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const isClosing = status === 'closed'
  const title = isClosing ? 'Close incident report' : 'Resolve incident report'

  useEffect(() => {
    const previousFocus = document.activeElement
    fieldRef.current?.focus()
    return () => { if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); return }
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('textarea:not([disabled]),button:not([disabled])')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = reason.trim()
    if (value.length < 3 || value.length > 1000) { setError('Enter a resolution note between 3 and 1,000 characters.'); return }
    setError('')
    try { await onConfirm(value) }
    catch (err) { setError(err instanceof Error ? err.message : 'The report could not be updated. Try again.') }
  }

  return <div className="meeting-reason-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section className="meeting-reason-dialog" role="dialog" aria-modal="true" aria-labelledby="incident-resolution-title" aria-describedby="incident-resolution-description" onKeyDown={handleKeyDown}>
      <div className="meeting-reason-icon"><ClipboardCheck size={22} aria-hidden="true" /></div>
      <h2 id="incident-resolution-title">{title}</h2>
      <p id="incident-resolution-description">Add a short note to preserve the action taken in the incident history.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="incident-resolution-note">Resolution note</label>
        <textarea ref={fieldRef} id="incident-resolution-note" rows={4} minLength={3} maxLength={1000} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe how this report was handled" />
        <div className="meeting-reason-meta"><span>{reason.trim().length}/1,000 characters</span>{error && <span role="alert">{error}</span>}</div>
        <div className="meeting-reason-actions">
          <button type="button" className="button outline" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : isClosing ? 'Close report' : 'Resolve report'}</button>
        </div>
      </form>
    </section>
  </div>
}
