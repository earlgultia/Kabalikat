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
    return status === undefined || !Number.isFinite(status) || status === 0 || status >= 500
  },
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
