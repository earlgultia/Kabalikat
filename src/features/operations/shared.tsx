import type { ReactNode } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'

export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="operation-heading"><div><div className="eyebrow">BARANGAY WORKSPACE</div><h1>{title}</h1><p>{description}</p></div>{children}</div>
}

export function LoadingNotice({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? 'ops-loading compact' : 'ops-loading'}><LoaderCircle size={17} className="spin" />Loading authorized records…</div>
}

export function ErrorNotice({ message, onRetry, retrying = false }: { message: string; onRetry?: () => void; retrying?: boolean }) {
  const detail = message.toLowerCase()
  const safeMessage = detail.includes('not authorized') || detail.includes('permission') || detail.includes('row-level security')
    ? 'Your account does not have access to this action.'
    : detail.includes('network') || detail.includes('fetch')
      ? 'The service could not be reached. Check your connection and try again.'
      : 'We could not complete that action. Check the details and try again.'
  return <div className="ops-error" role="alert"><AlertCircle size={17} /><span>{safeMessage}</span>{onRetry && <button type="button" className="ops-error-retry" onClick={onRetry} disabled={retrying}>{retrying ? 'Retrying…' : 'Try again'}</button>}</div>
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll(' ', '_')
  return <span className={'status-pill status-' + normalized}>{status.replaceAll('_', ' ')}</span>
}

export function EmptyNotice({ title, detail }: { title: string; detail: string }) {
  return <div className="ops-empty"><strong>{title}</strong><p>{detail}</p></div>
}

