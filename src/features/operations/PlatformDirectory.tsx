import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, ChevronLeft, ChevronRight, Download, RefreshCw, Search } from 'lucide-react'
import { getPlatformDirectorySummary, listPlatformBarangayPage, PLATFORM_DIRECTORY_PAGE_SIZE, type PlatformBarangayRow } from './platform-data'
import { encodeCsv } from './csv'

export function PlatformDirectory() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const summary = useQuery({ queryKey: ['platform-barangay-summary'], queryFn: getPlatformDirectorySummary, staleTime: 60_000 })
  const directory = useQuery({
    queryKey: ['platform-barangays', page, search, status],
    queryFn: () => listPlatformBarangayPage({ page, search, status }), staleTime: 60_000,
  })
  const rows = directory.data?.rows ?? []
  const total = directory.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PLATFORM_DIRECTORY_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageStart = total ? currentPage * PLATFORM_DIRECTORY_PAGE_SIZE + 1 : 0
  const pageEnd = Math.min((currentPage + 1) * PLATFORM_DIRECTORY_PAGE_SIZE, total)

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage)
  }, [currentPage, page])

  async function exportMatchingBarangays() {
    setExporting(true)
    setExportError('')
    try {
      const allRows: PlatformBarangayRow[] = []
      for (let exportPage = 0; ; exportPage += 1) {
        const result = await listPlatformBarangayPage({ page: exportPage, search, status })
        allRows.push(...result.rows)
        if (allRows.length >= result.total || result.rows.length === 0) break
      }
      const csvRows = [
        ['Barangay', 'Municipality', 'Province', 'Barangay code', 'Status', 'Active members', 'Onboarded'],
        ...allRows.map((item) => [item.name, item.municipality, item.province, item.code, item.status, String(item.active_members), new Date(item.created_at).toLocaleDateString()]),
      ]
      const url = URL.createObjectURL(new Blob([encodeCsv(csvRows)], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'kabalikat-barangay-directory.csv'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setExportError('Unable to export all matching barangays. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return <section className="panel platform-directory" aria-labelledby="platform-directory-title">
    <div className="panel-head"><div><h2 id="platform-directory-title">Barangay directory</h2><p>Platform tenant metadata and aggregate active membership counts.</p></div><Building2 size={19} /></div>
    <div className="platform-directory-summary"><strong>{summary.data?.registered_count ?? '—'}<small> registered</small></strong><strong>{summary.data?.active_count ?? '—'}<small> active</small></strong><strong>{summary.data?.needs_attention_count ?? '—'}<small> suspended or archived</small></strong></div>
    <div className="platform-directory-controls">
      <label className="archive-search"><Search size={17} /><input aria-label="Search barangays" placeholder="Search name, municipality, province, or code" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} /></label>
      <label className="archive-folder-select">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="all">All</option><option value="needs_attention">Needs attention</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></label>
      <span className="field-hint" aria-live="polite">Showing {pageStart}–{pageEnd} of {total} matching barangays</span>
      <button type="button" className="button outline" disabled={!total || exporting || directory.isFetching} onClick={() => void exportMatchingBarangays()}><Download size={15} />{exporting ? 'Exporting…' : 'Export matching rows'}</button>
      <button type="button" className="button outline" disabled={directory.isFetching || summary.isFetching} onClick={() => { void directory.refetch(); void summary.refetch() }}><RefreshCw size={15} />Refresh</button>
    </div>
    {exportError && <div className="ops-error" role="alert">{exportError}</div>}
    {directory.isPending ? <div className="ops-loading" role="status">Loading barangay directory…</div> : directory.error ? <div className="ops-error" role="alert">Unable to load the barangay directory. Refresh to try again.</div> : total ? <>
      <div className="ops-table-wrap platform-directory-table-wrap"><table className="ops-table platform-directory-table"><thead><tr><th>Barangay</th><th>Municipality / province</th><th>Code</th><th>Status</th><th>Active members</th><th>Onboarded</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.municipality}, {item.province}</td><td>{item.code}</td><td><span className={`status-pill status-${item.status}`}>{item.status}</span></td><td>{Number(item.active_members).toLocaleString()}</td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
      <div className="platform-directory-cards">{rows.map((item) => <article className="platform-directory-card" key={item.id}><div className="platform-directory-card-heading"><strong>{item.name}</strong><span className={`status-pill status-${item.status}`}>{item.status}</span></div><dl><div><dt>Municipality / province</dt><dd>{item.municipality}, {item.province}</dd></div><div><dt>Barangay code</dt><dd>{item.code}</dd></div><div><dt>Active members</dt><dd>{Number(item.active_members).toLocaleString()}</dd></div><div><dt>Onboarded</dt><dd>{new Date(item.created_at).toLocaleDateString()}</dd></div></dl></article>)}</div>
      {pageCount > 1 && <nav className="directory-pagination" aria-label="Barangay directory pages"><button type="button" className="button outline" disabled={currentPage === 0 || directory.isFetching} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} />Previous</button><span aria-live="polite">Page {currentPage + 1} of {pageCount}</span><button type="button" className="button outline" disabled={currentPage + 1 === pageCount || directory.isFetching} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={15} /></button></nav>}
    </> : <div className="ops-empty"><strong>{search || status !== 'all' ? 'No barangays match' : 'No barangays onboarded yet'}</strong><p>{search || status !== 'all' ? 'Try a different search or status.' : 'New barangays will appear here after onboarding.'}</p></div>}
    <p className="platform-directory-privacy">This directory does not include resident, document, meeting, or finance records.</p>
  </section>
}
