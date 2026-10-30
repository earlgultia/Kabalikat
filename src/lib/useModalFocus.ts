import { useCallback, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useModalFocus<T extends HTMLElement>() {
  const dialogRef = useRef<T>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.closest('[hidden], [aria-hidden="true"]'))
    ;(focusable[0] ?? dialog).focus()

    return () => {
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const handleDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.hasAttribute('disabled') && !element.closest('[hidden], [aria-hidden="true"]'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (!first || !last) {
      event.preventDefault()
      dialog.focus()
    } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  return { dialogRef, handleDialogKeyDown }
}
