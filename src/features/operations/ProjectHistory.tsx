import { useState, type SyntheticEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { listBarangayProjectUpdates, BARANGAY_PROJECT_UPDATE_PAGE_SIZE } from './projects-data'
import { listSkProjectActivity, listSkProjectUpdates, SK_PROJECT_HISTORY_PAGE_SIZE } from './sk-data'
import { ErrorNotice, LoadingNotice } from './shared'
import { formatDateTime } from './format'

export function ProjectProgressHistory({ tenantId, projectId, scope }: { tenantId: string; projectId: string; scope: 'barangay' | 'sk' }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const history = useQuery({
    queryKey: ['project-progress-history', scope, tenantId, projectId, page],
    queryFn: () => scope === 'barangay'
      ? listBarangayProjectUpdates(projectId, page)
      : listSkProjectUpdates(projectId, page),
    enabled: open,
  })
  const totalPages = Math.ceil((history.data?.totalCount ?? 0) / BARANGAY_PROJECT_UPDATE_PAGE_SIZE)
  return <details className="incident-history project-progress-history" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
    <summary>Milestones & progress{history.data ? ` (${history.data.totalCount})` : ''}</summary>
    {history.isPending && open && <LoadingNotice compact />}
    {history.error && <ErrorNotice message="Project progress history could not be loaded." />}
    {history.data?.totalCount === 0 && <p>No progress updates yet.</p>}
    {history.data?.rows.length ? <ol>{history.data.rows.map((update) => <li key={update.id}>
      <strong>{update.title}</strong><span>{update.update_type} · {formatDateTime(update.created_at)}</span>{update.details && <p>{update.details}</p>}
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
    {history.error && <ErrorNotice message="Project activity could not be loaded." />}
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
