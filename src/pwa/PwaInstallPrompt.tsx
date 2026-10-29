import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [isAppleMobile, setIsAppleMobile] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    if (standalone) return

    const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsAppleMobile(isApple)

    const onInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      setIsAppleMobile(false)
      setDismissed(true)
    }
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!installEvent) return
    setInstalling(true)
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === 'accepted') setDismissed(true)
      setInstallEvent(null)
    } catch {
      setInstallEvent(null)
    } finally {
      setInstalling(false)
    }
  }

  if (dismissed || (!installEvent && !isAppleMobile)) return null

  return <aside className="pwa-install-prompt" role="region" aria-label="Install KABALIKAT">
    <img src="/icons/kabalikat-heart-192.png" alt="" width="48" height="48" />
    <div className="pwa-install-copy">
      <strong>Use KABALIKAT as an app</strong>
      <p>{isAppleMobile && !installEvent ? 'In Safari, tap Share, then Add to Home Screen.' : 'Install it for quick access from your home screen.'}</p>
    </div>
    <div className="pwa-install-actions">
      {installEvent && <button type="button" className="button primary" onClick={() => void install()} disabled={installing}>{installing ? 'Opening…' : 'Install'}</button>}
      <button type="button" className="pwa-install-dismiss" onClick={() => setDismissed(true)}>Later</button>
    </div>
  </aside>
}
