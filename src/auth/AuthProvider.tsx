/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { resolveActiveMembership, type Membership } from '../lib/membership'

type AuthValue = {
  session: Session | null
  user: User | null
  membership: Membership | null
  memberships: Membership[]
  switchMembership: (membershipId: string) => void
  isPlatformAdmin: boolean
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function readSelectedMembership(userId: string) {
  try { return window.localStorage.getItem(`kabalikat-active-membership:${userId}`) } catch { return null }
}
function storeSelectedMembership(userId: string, membershipId: string | null) {
  try {
    const key = `kabalikat-active-membership:${userId}`
    if (membershipId) window.localStorage.setItem(key, membershipId)
    else window.localStorage.removeItem(key)
  } catch { /* Selection still works for this session if browser storage is unavailable. */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const knownTenantIds = useRef<string[]>([])
  const currentUserId = useRef<string | null>(null)

  const clearTenantData = useCallback((tenantIds: string[]) => {
    if (!tenantIds.length) return
    const ids = new Set(tenantIds)
    void queryClient.cancelQueries({ predicate: (query) => query.queryKey.some((part) => typeof part === 'string' && ids.has(part)) })
    queryClient.removeQueries({ predicate: (query) => query.queryKey.some((part) => typeof part === 'string' && ids.has(part)) })
  }, [queryClient])

  useEffect(() => {
    const client = supabase
    if (!client) { setLoading(false); return }
    let alive = true
    const loadMembership = async (userId: string | undefined) => {
      if (!userId) {
        clearTenantData(knownTenantIds.current); knownTenantIds.current = []
        setMembership(null); setMemberships([]); setIsPlatformAdmin(false); return
      }
      const [membershipResult, adminResult] = await Promise.all([
        client.from('barangay_memberships')
        .select('id, barangay_id, status, role:role_definitions(key,label,scope), barangay:barangays(id,name,municipality,province)')
        .eq('user_id', userId)
        .eq('status', 'active'),
        client.rpc('is_platform_administrator'),
      ])
      if (!alive || currentUserId.current !== userId) return
      if (membershipResult.error || adminResult.error) {
        clearTenantData(knownTenantIds.current); knownTenantIds.current = []
        setError('We could not load your secure access profile. Please try again.')
        setMembership(null); setMemberships([]); setIsPlatformAdmin(false); return
      }
      setError(null)
      const activeMemberships = ((membershipResult.data ?? []) as unknown as Membership[])
        .filter((item) => item.status === 'active' && item.role?.scope !== 'platform' && Boolean(item.barangay))
        .sort((left, right) => (left.barangay?.name ?? '').localeCompare(right.barangay?.name ?? ''))
      const storedMembershipId = readSelectedMembership(userId)
      const selectedMembership = activeMemberships.find((item) => item.id === storedMembershipId) ?? resolveActiveMembership(activeMemberships)
      const activeTenantIds = activeMemberships.map((item) => item.barangay_id)
      clearTenantData(knownTenantIds.current.filter((tenantId) => !activeTenantIds.includes(tenantId)))
      knownTenantIds.current = activeTenantIds
      setMemberships(activeMemberships)
      setMembership(selectedMembership)
      storeSelectedMembership(userId, selectedMembership?.id ?? null)
      setIsPlatformAdmin(adminResult.data === true)
    }
    void client.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      currentUserId.current = data.session?.user.id ?? null
      setSession(data.session)
      await loadMembership(data.session?.user.id)
      if (alive) setLoading(false)
    })
    let lastProfileRefresh = Date.now()
    const refreshProfile = () => {
      if (!alive || document.visibilityState !== 'visible' || Date.now() - lastProfileRefresh < 30_000) return
      lastProfileRefresh = Date.now()
      void client.auth.getSession().then(({ data }) => loadMembership(data.session?.user.id))
    }
    window.addEventListener('focus', refreshProfile)
    document.addEventListener('visibilitychange', refreshProfile)
    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      currentUserId.current = nextSession?.user.id ?? null
      setSession(nextSession)
      if (event === 'USER_UPDATED') return
      setLoading(true)
      lastProfileRefresh = Date.now()
      window.setTimeout(() => {
        void loadMembership(nextSession?.user.id).finally(() => { if (alive) setLoading(false) })
      }, 0)
    })
    return () => { alive = false; listener.subscription.unsubscribe(); window.removeEventListener('focus', refreshProfile); document.removeEventListener('visibilitychange', refreshProfile) }
  }, [clearTenantData, queryClient])

  const value = useMemo<AuthValue>(() => ({
    session, user: session?.user ?? null, membership, memberships, isPlatformAdmin, loading, error,
    switchMembership: (membershipId) => {
      const selected = memberships.find((item) => item.id === membershipId)
      if (!selected || !session?.user.id) return
      if (membership?.barangay_id && membership.barangay_id !== selected.barangay_id) clearTenantData([membership.barangay_id])
      setMembership(selected)
      storeSelectedMembership(session.user.id, selected.id)
    },
    signIn: async (email, password) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut() },
  }), [session, membership, memberships, isPlatformAdmin, loading, error, clearTenantData])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
