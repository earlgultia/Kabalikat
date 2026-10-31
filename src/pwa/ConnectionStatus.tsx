import { useEffect, useState } from 'react'
import { Wifi, WifiOff, X } from 'lucide-react'

export function ConnectionStatus() {
  const [status, setStatus] = useState<'online' | 'offline' | 'restored'>(() => navigator.onLine ? 'online' : 'offline')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let restoredTimer: number | undefined
    const onOnline = () => {
      window.clearTimeout(restoredTimer)
      setDismissed(false)
      setStatus('restored')
      restoredTimer = window.setTimeout(() => setStatus('online'), 7000)
    }
    const onOffline = () => {
      window.clearTimeout(restoredTimer)
      setDismissed(false)
      setStatus('offline')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.clearTimeout(restoredTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (status === 'online' || dismissed) return null

  return <div className={`connection-status ${status === 'restored' ? 'connection-status-restored' : ''}`} role="status" aria-live="polite">
    {status === 'restored' ? <Wifi size={17} aria-hidden="true" /> : <WifiOff size={17} aria-hidden="true" />}
    <p>{status === 'restored'
      ? <><strong>Connection restored.</strong> Retry loading any records that did not finish while offline.</>
      : <><strong>You’re offline.</strong> Live records and account actions need a connection. Changes are not saved for later sync.</>}</p>
    <button type="button" className="connection-status-dismiss" aria-label="Dismiss connection status" onClick={() => setDismissed(true)}><X size={16} /></button>
  </div>
}
