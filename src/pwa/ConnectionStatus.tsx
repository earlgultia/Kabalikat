import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function ConnectionStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const updateOnlineStatus = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  if (online) return null

  return <div className="connection-status" role="status" aria-live="polite">
    <WifiOff size={17} aria-hidden="true" />
    <p><strong>You’re offline.</strong> Live records and account actions need a connection. Changes are not saved for later sync.</p>
  </div>
}
