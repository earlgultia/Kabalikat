/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { resolveActiveMembership, type Membership } from '../lib/membership'

type AuthValue = {
  session: Session | null
  user: User | null
  membership: Membership | null
  isPlatformAdmin: boolean
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client) { setLoading(false); return }
    let alive = true
    const loadMembership = async (userId: string | undefined) => {
      if (!userId) { setMembership(null); setIsPlatformAdmin(false); return }
      const [membershipResult, adminResult] = await Promise.all([
        client.from('barangay_memberships')
        .select('id, barangay_id, status, role:role_definitions(key,label,scope), barangay:barangays(id,name,municipality,province)')
        .eq('user_id', userId)
        .eq('status', 'active'),
        client.rpc('is_platform_administrator'),
      ])
      if (!alive) return
      if (membershipResult.error || adminResult.error) { setError('We could not load your secure access profile. Please try again.'); setMembership(null); setIsPlatformAdmin(false); return }
      setError(null)
      setMembership(resolveActiveMembership((membershipResult.data ?? []) as unknown as Membership[]))
      setIsPlatformAdmin(adminResult.data === true)
    }
    void client.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadMembership(data.session?.user.id)
      if (alive) setLoading(false)
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(true)
      window.setTimeout(() => {
        void loadMembership(nextSession?.user.id).finally(() => { if (alive) setLoading(false) })
      }, 0)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthValue>(() => ({
    session, user: session?.user ?? null, membership, isPlatformAdmin, loading, error,
    signIn: async (email, password) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut() },
  }), [session, membership, isPlatformAdmin, loading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
