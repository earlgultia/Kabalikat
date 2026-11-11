import { useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addBarangayProjectUpdateResponse,
  listBarangayProjectUpdateResponses,
  listBarangayProjectUpdates,
  BARANGAY_PROJECT_UPDATE_PAGE_SIZE,
} from './projects-data'
import { listSkProjectActivity, listSkProjectUpdates, SK_PROJECT_HISTORY_PAGE_SIZE } from './sk-data'
import { ErrorNotice, LoadingNotice } from './shared'
import { formatDateTime } from './format'

export function BarangayProjectUpdateResponseThread({ updateId, isOwnUpdate, canRespond, initialPage = 0, autoOpen = false, onFocusHandled }: { updateId: string; isOwnUpdate: boolean; canRespond: boolean; initialPage?: number; autoOpen?: boolean; onFocusHandled?: () => void }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filters, setFilters] = useState({ search: '', createdAfter: '', createdBefore: '' })
  const [filterDraft, setFilterDraft] = useState({ search: '', createdAfter: '', createdBefore: '' })
  const [filterError, setFilterError] = useState('')
  const responses = useQuery({
    queryKey: ['barangay-project-update-responses', updateId, page, filters],
    queryFn: () => listBarangayProjectUpdateResponses(updateId, page, filters),
    enabled: open,
  })
  useEffect(() => {
    if (!autoOpen) return
    setPage(initialPage)
    setOpen(true)
    if (detailsRef.current && !detailsRef.current.open) detailsRef.current.open = true
    onFocusHandled?.()
  }, [autoOpen, initialPage, onFocusHandled])

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = content.trim()
    if (trimmed.length < 3 || trimmed.length > 3000) {
      setError('Write a response between 3 and 3,000 characters.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      await addBarangayProjectUpdateResponse(updateId, trimmed)
      setContent('')
      setPage(0)
      await queryClient.invalidateQueries({ queryKey: ['barangay-project-update-responses', updateId] })
      setMessage('Response sent to the update author.')
    } catch {
      setError('Unable to send this response. Check your access and try again.')
    } finally { setBusy(false) }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (filterDraft.createdAfter && filterDraft.createdBefore && filterDraft.createdAfter > filterDraft.createdBefore) {
      setFilterError('The start date must be on or before the end date.')
      return
    }
    setFilterError('')
    setPage(0)
    setFilters({ ...filterDraft, search: filterDraft.search.trim() })
  }

  function clearFilters() {
    const empty = { search: '', createdAfter: '', createdBefore: '' }
    setFilters(empty)
    setFilterDraft(empty)
    setFilterError('')
    setPage(0)
  }

  return <details ref={detailsRef} className="project-update-response-thread" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
    <summary>Responses{responses.data ? ` (${responses.data.totalCount})` : ''}</summary>
    {responses.isPending && open && <LoadingNotice compact />}
    {responses.error && <ErrorNotice message="Responses could not be loaded." onRetry={() => void responses.refetch()} retrying={responses.isFetching} />}
    <form className="project-response-filters" onSubmit={applyFilters}>
      <label>Search replies<input type="search" maxLength={100} placeholder="Author or message" value={filterDraft.search} onChange={(event) => setFilterDraft((current) => ({ ...current, search: event.target.value }))} /></label>
      <label>From<input type="date" max={filterDraft.createdBefore || undefined} value={filterDraft.createdAfter} onChange={(event) => setFilterDraft((current) => ({ ...current, createdAfter: event.target.value }))} /></label>
      <label>To<input type="date" min={filterDraft.createdAfter || undefined} value={filterDraft.createdBefore} onChange={(event) => setFilterDraft((current) => ({ ...current, createdBefore: event.target.value }))} /></label>
      <div><button className="button primary" type="submit">Apply</button><button className="button outline" type="button" onClick={clearFilters} disabled={!filterDraft.search && !filterDraft.createdAfter && !filterDraft.createdBefore}>Clear</button></div>
    </form>
    {filterError && <p className="field-hint" role="alert">{filterError}</p>}
    {responses.data?.totalCount === 0 && <p className="field-hint">{filters.search || filters.createdAfter || filters.createdBefore ? 'No replies match these filters.' : 'No responses yet.'}</p>}
    {responses.data?.rows.length ? <ol className="project-update-response-list">{responses.data.rows.map((response) => <li key={response.id}>
      <div><strong>{response.author_name}</strong><time dateTime={response.created_at}>{formatDateTime(response.created_at)}</time></div>
      <p>{response.content}</p>
    </li>)}</ol> : null}
    {responses.data && responses.data.totalCount > 10 && <nav className="committee-picker-pagination" aria-label="Project response pages"><span>Page {page + 1} of {Math.ceil(responses.data.totalCount / 10)}</span><div><button type="button" className="button outline" disabled={page === 0 || responses.isFetching} onClick={() => setPage((current) => current - 1)}>Previous</button><button type="button" className="button outline" disabled={(page + 1) * 10 >= responses.data.totalCount || responses.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button></div></nav>}
    {canRespond && !isOwnUpdate && <form className="project-update-response-form" onSubmit={(event) => void submitResponse(event)}>
      <label htmlFor={`project-update-response-${updateId}`}>Reply to this update</label>
      <textarea id={`project-update-response-${updateId}`} value={content} minLength={3} maxLength={3000} onChange={(event) => setContent(event.target.value)} required />
      {error && <ErrorNotice message={error} />}{message && <p className="ops-success" role="status">{message}</p>}
      <button className="button outline" type="submit" disabled={busy || content.trim().length < 3}>{busy ? 'Sending...' : 'Send response'}</button>
    </form>}
  </details>
}

export function ProjectProgressHistory({ tenantId, projectId, scope, canRespond = false, focusUpdateId, focusUpdatePage, focusResponsePage, openResponseThread = false, onFocusHandled }: { tenantId: string; projectId: string; scope: 'barangay' | 'sk'; canRespond?: boolean; focusUpdateId?: string; focusUpdatePage?: number; focusResponsePage?: number; openResponseThread?: boolean; onFocusHandled?: () => void }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const history = useQuery({
    queryKey: ['project-progress-history', scope, tenantId, projectId, page],
    queryFn: () => scope === 'barangay'
      ? listBarangayProjectUpdates(projectId, page)
      : listSkProjectUpdates(projectId, page),
    enabled: open,
  })
  const totalPages = Math.ceil((history.data?.totalCount ?? 0) / BARANGAY_PROJECT_UPDATE_PAGE_SIZE)
  useEffect(() => {
    if (!focusUpdateId || scope !== 'barangay') return
    setPage(focusUpdatePage ?? 0)
    setOpen(true)
    if (detailsRef.current && !detailsRef.current.open) detailsRef.current.open = true
  }, [focusUpdateId, focusUpdatePage, scope])
  useEffect(() => {
    if (!focusUpdateId || !history.data?.rows.some((update) => update.id === focusUpdateId)) return
    document.getElementById(`project-update-${focusUpdateId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusUpdateId, history.data])
  return <details ref={detailsRef} className="incident-history project-progress-history" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
    <summary>Milestones &amp; progress{history.data ? ` (${history.data.totalCount})` : ''}</summary>
    {history.isPending && open && <LoadingNotice compact />}
    {history.error && <ErrorNotice message="Project progress history could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
    {history.data?.totalCount === 0 && <p>No progress updates yet.</p>}
    {history.data?.rows.length ? <ol>{history.data.rows.map((update) => <li id={`project-update-${update.id}`} key={update.id}>
      <strong>{update.title}</strong>
      <span>{update.update_type} · {formatDateTime(update.created_at)}</span>
      {update.details && <p>{update.details}</p>}
      {scope === 'barangay' && (canRespond || Boolean('is_own_update' in update && update.is_own_update)) && <BarangayProjectUpdateResponseThread updateId={update.id} isOwnUpdate={Boolean('is_own_update' in update && update.is_own_update)} canRespond={canRespond} initialPage={focusResponsePage ?? 0} autoOpen={openResponseThread && update.id === focusUpdateId} onFocusHandled={onFocusHandled} />}
    </li>)}</ol> : null}
    {totalPages > 1 && <div className="ops-form-actions"><span className="field-hint">Page {page + 1} of {totalPages} · {history.data?.totalCount} updates</span><div className="finance-review-actions">
      <button className="button outline" disabled={page === 0 || history.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={15} />Previous</button>
      <button className="button outline" disabled={page + 1 >= totalPages || history.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></button>
    </div></div>}
  </details>
}

export function SkProjectActivityHistory({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const history = useQuery({
    queryKey: ['sk-project-activity', tenantId, projectId, page],
    queryFn: () => listSkProjectActivity(projectId, page),
    enabled: open,
  })
  const totalPages = Math.ceil((history.data?.totalCount ?? 0) / SK_PROJECT_HISTORY_PAGE_SIZE)
  return <details className="sk-event-audit project-progress-history" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
    <summary>Project activity history{history.data ? ` (${history.data.totalCount})` : ''}</summary>
    {history.isPending && open && <LoadingNotice compact />}
    {history.error && <ErrorNotice message="Project activity could not be loaded." onRetry={() => void history.refetch()} retrying={history.isFetching} />}
    {history.data?.totalCount === 0 && <p className="field-hint">No project activity has been recorded.</p>}
    {history.data?.rows.length ? <ol>{history.data.rows.map((entry) => <li key={`${entry.action}-${entry.created_at}`}>
      <span><strong>{entry.action.replace('project_', '').replaceAll('_', ' ')}</strong><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></span>
      <small>{entry.actor_name}{entry.details ? ` · ${entry.details}` : ''}</small>
    </li>)}</ol> : null}
    {totalPages > 1 && <div className="finance-review-actions"><span className="field-hint">Page {page + 1} of {totalPages}</span>
      <button className="button outline" disabled={page === 0 || history.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={15} />Previous</button>
      <button className="button outline" disabled={page + 1 >= totalPages || history.isFetching} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={15} /></button>
    </div>}
  </details>
}
