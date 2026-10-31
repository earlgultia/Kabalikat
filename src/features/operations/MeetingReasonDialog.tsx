import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ClipboardCheck } from 'lucide-react'

export function MeetingReasonDialog({ title, description, label, confirmLabel, busy, onCancel, onConfirm }: {
  title: string; description: string; label: string; confirmLabel: string; busy: boolean
  onCancel: () => void; onConfirm: (reason: string) => Promise<void>
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

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
    if (value.length < 3 || value.length > 1000) { setError('Enter a reason between 3 and 1,000 characters.'); return }
    setError('')
    try { await onConfirm(value) }
    catch (err) { setError(err instanceof Error ? err.message : 'The action could not be completed. Try again.') }
  }

  return <div className="meeting-reason-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section className="meeting-reason-dialog" role="dialog" aria-modal="true" aria-labelledby="meeting-reason-title" aria-describedby="meeting-reason-description" onKeyDown={handleKeyDown}>
      <div className="meeting-reason-icon"><ClipboardCheck size={22} aria-hidden="true" /></div>
      <h2 id="meeting-reason-title">{title}</h2>
      <p id="meeting-reason-description">{description}</p>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="meeting-reason-input">{label}</label>
        <textarea ref={fieldRef} id="meeting-reason-input" rows={4} minLength={3} maxLength={1000} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Add a brief explanation" />
        <div className="meeting-reason-meta"><span>{reason.trim().length}/1,000 characters</span>{error && <span role="alert">{error}</span>}</div>
        <div className="meeting-reason-actions">
          <button ref={cancelRef} type="button" className="button outline" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : confirmLabel}</button>
        </div>
      </form>
    </section>
  </div>
}
