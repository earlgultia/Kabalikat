import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { PwaInstallPrompt } from './pwa/PwaInstallPrompt'
import { PwaUpdatePrompt } from './pwa/PwaUpdatePrompt'
import { ConnectionStatus } from './pwa/ConnectionStatus'
import './styles.css'

const queryClient = new QueryClient({ defaultOptions: { queries: {
  retry: (failureCount, error) => {
    if (failureCount >= 2) return false
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : undefined
    if (status !== undefined) return Number.isFinite(status) && (status === 0 || status === 408 || status === 429 || status >= 500)
    const message = error instanceof Error ? error.message : String(error)
    return error instanceof TypeError || /network|failed to fetch|fetch failed|load failed|timed? ?out|connection reset|too many requests|rate limit|status(?: code)? 408|status(?: code)? 429/i.test(message)
  },
  // Spread transient retries across clients so a short outage does not cause
  // every open dashboard to retry at the exact same moment.
  retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 10_000) + Math.random() * 750,
  refetchOnWindowFocus: true,
} } })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter><ConnectionStatus /><AuthProvider><App /><PwaInstallPrompt /><PwaUpdatePrompt /></AuthProvider></BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
)
