import { useEffect, useRef, type KeyboardEvent } from 'react'
import { LogOut, ShieldCheck } from 'lucide-react'

export function LogoutConfirmationDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    cancelButtonRef.current?.focus()
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  function trapDialogFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return <div className="logout-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="logout-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-description" onKeyDown={trapDialogFocus}>
      <div className="logout-confirm-icon"><LogOut size={25} aria-hidden="true" /></div>
      <div className="logout-confirm-kicker"><ShieldCheck size={14} /> KABALIKAT ACCOUNT</div>
      <h2 id="logout-confirm-title">Are you sure you want to log out?</h2>
      <p id="logout-confirm-description">You’ll need to sign in again to return to your workspace.</p>
      <div className="logout-confirm-actions">
        <button ref={cancelButtonRef} type="button" className="logout-confirm-no" onClick={onCancel}>No</button>
        <button type="button" className="logout-confirm-yes" onClick={onConfirm}>Yes, log out</button>
      </div>
    </section>
  </div>
}
