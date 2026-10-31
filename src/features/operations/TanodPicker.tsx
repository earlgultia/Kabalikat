import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export type TanodPickerPermission = 'incident.manage' | 'patrol.manage'
type Tanod = { user_id: string; display_name: string }
const PAGE_SIZE = 25

export function TanodPicker({ tenantId, permission, name, selectedId, onChange, disabled = false, label = 'Active Tanod' }: {
  tenantId: string
  permission: TanodPickerPermission
  name?: string
  selectedId: string
  onChange: (id: string) => void
  disabled?: boolean
  label?: string
}) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim().slice(0, 100)); setPage(0) }, 250)
    return () => window.clearTimeout(timer)
  }, [search])
  const query = useQuery({
    queryKey: ['tanod-picker', tenantId, permission, page, debouncedSearch],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data, error } = await supabase.rpc('list_active_tanod_page', {
        p_barangay_id: tenantId, p_permission: permission, p_page: page, p_page_size: PAGE_SIZE,
        p_search: debouncedSearch, p_selected_user_id: null,
      })
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as Array<Tanod & { total_count: number }>
      return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
    },
  })
  const totalPages = Math.ceil((query.data?.totalCount ?? 0) / PAGE_SIZE)
  return <div className="tanod-picker">
    <label className="tanod-picker-search"><span>{label} — search directory</span><span className="tanod-picker-search-input"><Search size={16} /><input type="search" value={search} maxLength={100} placeholder="Search Tanod name" onChange={(event) => setSearch(event.target.value)} disabled={disabled} /></span></label>
    <label className="tanod-picker-select"><span>{label}</span><select name={name} required={Boolean(name)} value={selectedId} disabled={disabled || query.isPending || !query.data?.rows.length} onChange={(event) => onChange(event.target.value)}>
      <option value="" disabled>Select an active Tanod</option>
      {selectedId && !query.data?.rows.some((person) => person.user_id === selectedId) && <option value={selectedId}>Currently assigned Tanod — search to find by name</option>}
      {query.data?.rows.map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name}{person.user_id === selectedId ? ' (currently selected)' : ''}</option>)}
    </select></label>
    {query.isPending && <span className="muted" aria-live="polite">Loading Tanods…</span>}
    {query.error && <span className="tanod-picker-error" role="alert">Could not load the Tanod list.</span>}
    {!query.isPending && !query.error && query.data?.totalCount === 0 && <span className="muted">{debouncedSearch ? 'No Tanods match that search.' : 'No active Tanods are available.'}</span>}
    {totalPages > 1 && <div className="tanod-picker-pages"><span className="muted">Page {page + 1} of {totalPages} · {query.data?.totalCount} Tanods</span><div>
      <button type="button" className="button outline" aria-label="Previous Tanod page" disabled={page === 0 || query.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} /><span>Previous</span></button>
      <button type="button" className="button outline" aria-label="Next Tanod page" disabled={page + 1 >= totalPages || query.isFetching} onClick={() => setPage((current) => current + 1)}><span>Next</span><ChevronRight size={16} /></button>
    </div></div>}
  </div>
}
