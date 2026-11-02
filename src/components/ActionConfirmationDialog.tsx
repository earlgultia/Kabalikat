import { useEffect, useRef, type KeyboardEvent } from 'react'
import { CircleAlert, ShieldCheck } from 'lucide-react'

export function ActionConfirmationDialog({ title, description, confirmLabel, busy, onCancel, onConfirm }: {
  title: string
  description: string
  confirmLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    cancelRef.current?.focus()
    return () => { if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); return }
    if (event.key !== 'Tab') return
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  return <div className="action-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section className="action-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="action-confirm-title" aria-describedby="action-confirm-description" onKeyDown={trapFocus}>
      <div className="action-confirm-icon"><CircleAlert size={24} aria-hidden="true" /></div>
      <div className="action-confirm-kicker"><ShieldCheck size={14} /> KABALIKAT ADMIN ACTION</div>
      <h2 id="action-confirm-title">{title}</h2>
      <p id="action-confirm-description">{description}</p>
      <div className="action-confirm-actions">
        <button ref={cancelRef} type="button" className="action-confirm-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="action-confirm-submit" disabled={busy} onClick={onConfirm}>{busy ? 'Saving…' : confirmLabel}</button>
      </div>
    </section>
  </div>
}
