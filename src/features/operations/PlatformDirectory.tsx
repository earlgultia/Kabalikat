import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, RefreshCw, Search } from 'lucide-react'
import { listPlatformBarangays } from './platform-data'

export function PlatformDirectory() {
  const directory = useQuery({ queryKey: ['platform-barangays'], queryFn: listPlatformBarangays, staleTime: 60_000 })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const filtered = useMemo(() => (directory.data ?? []).filter((barangay) => {
    const text = `${barangay.name} ${barangay.municipality} ${barangay.province} ${barangay.code}`.toLocaleLowerCase()
    return text.includes(search.trim().toLocaleLowerCase()) && (status === 'all' || barangay.status === status)
  }), [directory.data, search, status])
  const active = directory.data?.filter((barangay) => barangay.status === 'active').length ?? 0

  return <section className="panel platform-directory" aria-labelledby="platform-directory-title">
    <div className="panel-head"><div><h2 id="platform-directory-title">Barangay directory</h2><p>Platform tenant metadata and aggregate active membership counts.</p></div><Building2 size={19} /></div>
    <div className="platform-directory-summary"><strong>{directory.data?.length ?? '—'}<small> registered</small></strong><strong>{active}<small> active</small></strong></div>
    <div className="platform-directory-controls"><label className="archive-search"><Search size={17} /><input aria-label="Search barangays" placeholder="Search name, municipality, province, or code" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="archive-folder-select">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></label><button className="button outline" disabled={directory.isFetching} onClick={() => void directory.refetch()}><RefreshCw size={15} />Refresh</button></div>
    {directory.isPending ? <div className="ops-loading" role="status">Loading barangay directory…</div> : directory.error ? <div className="ops-error" role="alert">{directory.error.message}</div> : filtered.length ? <div className="ops-table-wrap"><table className="ops-table platform-directory-table"><thead><tr><th>Barangay</th><th>Municipality / province</th><th>Code</th><th>Status</th><th>Active members</th><th>Onboarded</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.municipality}, {item.province}</td><td>{item.code}</td><td><span className={`status-pill status-${item.status}`}>{item.status}</span></td><td>{Number(item.active_members).toLocaleString()}</td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <div className="ops-empty"><strong>{directory.data?.length ? 'No barangays match' : 'No barangays onboarded yet'}</strong><p>{directory.data?.length ? 'Try a different search or status.' : 'New barangays will appear here after onboarding.'}</p></div>}
    <p className="platform-directory-privacy">This directory does not include resident, document, meeting, or finance records.</p>
  </section>
}
