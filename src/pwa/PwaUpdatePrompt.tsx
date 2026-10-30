import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

export function PwaUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [applying, setApplying] = useState(false)
  const applyingRef = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null
    let disposed = false
    const showWaitingWorker = () => {
      if (registration?.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting)
    }
    const watchInstallingWorker = () => {
      registration?.installing?.addEventListener('statechange', showWaitingWorker)
    }
    const reloadAfterActivation = () => {
      if (applyingRef.current) window.location.reload()
    }
    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((result) => {
        if (disposed) return
        registration = result
        registration.addEventListener('updatefound', watchInstallingWorker)
        watchInstallingWorker()
        showWaitingWorker()
      }).catch(() => {
        // Keep the app usable if service-worker registration is unavailable.
      })
    }

    navigator.serviceWorker.addEventListener('controllerchange', reloadAfterActivation)
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => {
      disposed = true
      window.removeEventListener('load', register)
      navigator.serviceWorker.removeEventListener('controllerchange', reloadAfterActivation)
      registration?.removeEventListener('updatefound', watchInstallingWorker)
    }
  }, [])

  function applyUpdate() {
    if (!waitingWorker) return
    applyingRef.current = true
    setApplying(true)
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  if (!waitingWorker) return null

  return <aside className="pwa-update-prompt" role="status" aria-live="polite">
    <div className="pwa-update-copy"><strong>A KABALIKAT update is ready</strong><p>Reload to use the latest version.</p></div>
    <button type="button" className="button primary" onClick={applyUpdate} disabled={applying}><RefreshCw size={15} />{applying ? 'Updating…' : 'Update now'}</button>
    {!applying && <button type="button" className="pwa-update-dismiss" aria-label="Dismiss update notice" onClick={() => setWaitingWorker(null)}><X size={17} /></button>}
  </aside>
}
