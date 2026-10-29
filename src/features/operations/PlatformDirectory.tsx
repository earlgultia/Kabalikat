import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, ChevronLeft, ChevronRight, Download, RefreshCw, Search } from 'lucide-react'
import { listPlatformBarangays } from './platform-data'
import { encodeCsv } from './csv'

export function PlatformDirectory() {
  const directory = useQuery({ queryKey: ['platform-barangays'], queryFn: listPlatformBarangays, staleTime: 60_000 })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 25
  const filtered = useMemo(() => (directory.data ?? []).filter((barangay) => {
    const text = `${barangay.name} ${barangay.municipality} ${barangay.province} ${barangay.code}`.toLocaleLowerCase()
    const needsAttention = barangay.status === 'suspended' || barangay.status === 'archived'
    return text.includes(search.trim().toLocaleLowerCase()) && (status === 'all' || (status === 'needs_attention' ? needsAttention : barangay.status === status))
  }), [directory.data, search, status])
  const active = directory.data?.filter((barangay) => barangay.status === 'active').length ?? 0
  const needsAttention = directory.data?.filter((barangay) => barangay.status === 'suspended' || barangay.status === 'archived').length ?? 0
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function exportVisibleBarangays() {
    const rows = [
      ['Barangay', 'Municipality', 'Province', 'Barangay code', 'Status', 'Active members', 'Onboarded'],
      ...filtered.map((item) => [item.name, item.municipality, item.province, item.code, item.status, String(item.active_members), new Date(item.created_at).toLocaleDateString()]),
    ]
    const url = URL.createObjectURL(new Blob([encodeCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'kabalikat-barangay-directory.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="panel platform-directory" aria-labelledby="platform-directory-title">
    <div className="panel-head"><div><h2 id="platform-directory-title">Barangay directory</h2><p>Platform tenant metadata and aggregate active membership counts.</p></div><Building2 size={19} /></div>
    <div className="platform-directory-summary"><strong>{directory.data?.length ?? '—'}<small> registered</small></strong><strong>{active}<small> active</small></strong><strong>{needsAttention}<small> suspended or archived</small></strong></div>
    <div className="platform-directory-controls"><label className="archive-search"><Search size={17} /><input aria-label="Search barangays" placeholder="Search name, municipality, province, or code" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label><label className="archive-folder-select">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="all">All</option><option value="needs_attention">Needs attention</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></label><span className="field-hint" aria-live="polite">Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} matching barangays</span><button type="button" className="button outline" disabled={!filtered.length} onClick={exportVisibleBarangays}><Download size={15} />Export matching rows</button><button type="button" className="button outline" disabled={directory.isFetching} onClick={() => void directory.refetch()}><RefreshCw size={15} />Refresh</button></div>
    {directory.isPending ? <div className="ops-loading" role="status">Loading barangay directory…</div> : directory.error ? <div className="ops-error" role="alert">Unable to load the barangay directory. Refresh to try again.</div> : filtered.length ? <><div className="ops-table-wrap platform-directory-table-wrap"><table className="ops-table platform-directory-table"><thead><tr><th>Barangay</th><th>Municipality / province</th><th>Code</th><th>Status</th><th>Active members</th><th>Onboarded</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.municipality}, {item.province}</td><td>{item.code}</td><td><span className={`status-pill status-${item.status}`}>{item.status}</span></td><td>{Number(item.active_members).toLocaleString()}</td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div><div className="platform-directory-cards">{visible.map((item) => <article className="platform-directory-card" key={item.id}><div className="platform-directory-card-heading"><strong>{item.name}</strong><span className={`status-pill status-${item.status}`}>{item.status}</span></div><dl><div><dt>Municipality / province</dt><dd>{item.municipality}, {item.province}</dd></div><div><dt>Barangay code</dt><dd>{item.code}</dd></div><div><dt>Active members</dt><dd>{Number(item.active_members).toLocaleString()}</dd></div><div><dt>Onboarded</dt><dd>{new Date(item.created_at).toLocaleDateString()}</dd></div></dl></article>)}</div>{pageCount > 1 && <nav className="directory-pagination" aria-label="Barangay directory pages"><button type="button" className="button outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} />Previous</button><span aria-live="polite">Page {currentPage} of {pageCount}</span><button type="button" className="button outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={15} /></button></nav>}</> : <div className="ops-empty"><strong>{directory.data?.length ? 'No barangays match' : 'No barangays onboarded yet'}</strong><p>{directory.data?.length ? 'Try a different search or status.' : 'New barangays will appear here after onboarding.'}</p></div>}
    <p className="platform-directory-privacy">This directory does not include resident, document, meeting, or finance records.</p>
  </section>
}
