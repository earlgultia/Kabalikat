import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { App } from './App'
import { PwaInstallPrompt } from './pwa/PwaInstallPrompt'
import { PwaUpdatePrompt } from './pwa/PwaUpdatePrompt'
import { ConnectionStatus } from './pwa/ConnectionStatus'
import './styles.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter><ConnectionStatus /><AuthProvider><App /><PwaInstallPrompt /><PwaUpdatePrompt /></AuthProvider></BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
