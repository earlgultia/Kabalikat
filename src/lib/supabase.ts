import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const projectRef = url ? new URL(url).hostname.split('.')[0] : ''
export const supabaseAuthStorageKey = projectRef ? `sb-${projectRef}-auth-token` : ''

export function clearLocalSupabaseSession() {
  if (!supabaseAuthStorageKey || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(supabaseAuthStorageKey)
    window.localStorage.removeItem(`${supabaseAuthStorageKey}-code-verifier`)
    window.localStorage.removeItem(`${supabaseAuthStorageKey}-user`)
  } catch { /* The auth provider still clears its in-memory account state. */ }
}

export const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: { storageKey: supabaseAuthStorageKey },
}) : null
export const supabaseConfigured = Boolean(supabase)
