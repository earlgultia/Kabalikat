import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, ChevronLeft, ChevronRight, Download, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { listAllSkAccomplishments, listSkAccomplishments, listSkAccomplishmentYears, reviewSkAccomplishment, SK_ACCOMPLISHMENT_PAGE_SIZE } from './sk-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { encodeCsv } from './csv'

export function SkTransparencyPage() {
  const { membership, user } = useAuth()
  const queryClient = useQueryClient()
  const tenantId = membership?.barangay_id ?? ''
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'sk.manage'], queryFn: () => hasPermission(tenantId, 'sk.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'sk.review'], queryFn: () => hasPermission(tenantId, 'sk.review'), enabled: Boolean(tenantId) })
  const [year, setYear] = useState('all')
  const [publishedPage, setPublishedPage] = useState(0)
  const [reviewPage, setReviewPage] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewMessage, setReviewMessage] = useState('')
  const yearNumber = year === 'all' ? null : Number(year)
  const years = useQuery({ queryKey: ['sk-accomplishment-years', tenantId], queryFn: () => listSkAccomplishmentYears(tenantId), enabled: Boolean(tenantId) })
  const items = useQuery({
    queryKey: ['sk-accomplishments', tenantId, 'published', year, publishedPage],
    queryFn: () => listSkAccomplishments(tenantId, publishedPage, 'published', yearNumber),
    enabled: Boolean(tenantId),
  })
  const reviewItems = useQuery({
    queryKey: ['sk-accomplishments', tenantId, 'review', reviewPage],
    queryFn: () => listSkAccomplishments(tenantId, reviewPage, 'review'),
    enabled: Boolean(tenantId && (canManage.data || canReview.data)),
  })
  const published = items.data?.rows ?? []
  const reviewQueue = reviewItems.data?.rows ?? []
  const publishedPages = Math.ceil((items.data?.totalCount ?? 0) / SK_ACCOMPLISHMENT_PAGE_SIZE)
  const reviewPages = Math.ceil((reviewItems.data?.totalCount ?? 0) / SK_ACCOMPLISHMENT_PAGE_SIZE)

  async function review(itemId: string, publish: boolean) {
    const note = publish ? null : window.prompt('Why is this summary being returned? (3–1000 characters):')?.trim() ?? ''
    if (!publish && (!note || note.length < 3 || note.length > 1000)) return
    if (publish && !window.confirm('Publish this accomplishment summary to active barangay members?')) return
    setReviewBusy(true); setReviewError(''); setReviewMessage('')
    try {
      await reviewSkAccomplishment(itemId, publish, note)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sk-accomplishments', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['captain-review-queue', tenantId] }),
      ])
      setReviewMessage(publish ? 'Accomplishment summary published.' : 'Summary returned to the SK Chairperson with a reason.')
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to review this summary.')
    } finally { setReviewBusy(false) }
  }

  async function exportCsv() {
    setExporting(true); setExportError('')
    try {
      const allPublished = await listAllSkAccomplishments(tenantId, yearNumber)
      const rows = [['Published', 'Title', 'Summary'], ...allPublished.map((item) => [
      item.published_at ? new Date(item.published_at).toLocaleDateString() : '', item.title, item.summary,
    ])]
      const blob = new Blob([encodeCsv(rows)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kabalikat-sk-accomplishments-${year === 'all' ? 'all-years' : year}.csv`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unable to export the published summaries.')
    } finally { setExporting(false) }
  }

  return <section className="operation-page">
    <PageHeading title="SK accomplishments" description="Captain-approved summaries of completed youth projects.">
      <button className="button outline" onClick={() => void exportCsv()} disabled={!items.data?.totalCount || exporting}><Download size={16} />{exporting ? 'Preparing export…' : 'Export published summaries'}</button>
    </PageHeading>
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Reviewed before publication.</strong> Only the submitted title and summary are shown here. Do not include personal details, participant names, or private financial information.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view published SK accomplishments." />}
    {Boolean(tenantId) && (canManage.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canManage.error || canReview.error) && <ErrorNotice message="SK review access could not be checked. Published summaries remain available; internal review items are hidden until access can be verified." />}
    {items.isPending && tenantId && <LoadingNotice />}{items.error && <ErrorNotice message="Unable to load SK accomplishment summaries." />}
    {exportError && <ErrorNotice message={exportError} />}
    {tenantId && <div className="ops-filter-row"><label>Publication year<select aria-label="Filter accomplishments by publication year" value={year} onChange={(event) => { setYear(event.target.value); setPublishedPage(0) }}><option value="all">All years</option>{(years.data ?? []).map((itemYear) => <option key={itemYear} value={itemYear}>{itemYear}</option>)}</select></label><span className="field-hint">CSV export includes all published summaries matching this year, fetched in pages.</span></div>}
    {years.error && <ErrorNotice message="Publication years could not be loaded; you can still browse all years." />}
    {items.data?.totalCount === 0 && !items.isPending && <div className="ops-empty"><Award size={22} /><strong>No published accomplishments for this period</strong><p>Approved summaries will appear here after independent Captain review.</p></div>}
    <div className="sk-project-list">{published.map((item) => <article className="ops-panel sk-project-card" key={item.id}><div className="sk-project-header sk-accomplishment-header"><div><StatusPill status={item.status} /><h2>{item.title}</h2><p>{item.summary}</p></div><Award size={22} /></div><div className="sk-project-meta"><span>{item.published_at ? `Published ${formatDateTime(item.published_at)}` : ''}</span></div></article>)}</div>
    {publishedPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Published SK accomplishment pages"><span className="field-hint">Page {publishedPage + 1} of {publishedPages} · {items.data?.totalCount.toLocaleString()} summaries</span><div className="finance-review-actions"><button className="button outline" disabled={publishedPage === 0 || items.isFetching} onClick={() => setPublishedPage((page) => page - 1)}><ChevronLeft size={16} />Previous</button><button className="button outline" disabled={publishedPage + 1 >= publishedPages || items.isFetching} onClick={() => setPublishedPage((page) => page + 1)}>Next<ChevronRight size={16} /></button></div></nav>}
    {(canManage.data || canReview.data) && <section className="sk-project-list"><h2>Internal review queue</h2>{reviewMessage && <div className="ops-success" role="status">{reviewMessage}</div>}{reviewError && <ErrorNotice message={reviewError} />}{reviewItems.isPending && <LoadingNotice compact />}{reviewItems.error && <ErrorNotice message="Unable to load the accomplishment review queue." />}{reviewItems.data?.totalCount === 0 && !reviewItems.isPending && <p className="field-hint">No accomplishments are waiting for review.</p>}{reviewQueue.map((item) => <article className="ops-panel sk-project-card" key={item.id}><div className="sk-project-header"><div><StatusPill status={item.status} /><h3>{item.title}</h3><p>{item.summary}</p></div></div><div className="sk-project-meta"><span>Submitted {formatDateTime(item.created_at)}</span></div>{item.review_note && <p className="finance-review-note">Captain’s note: {item.review_note}</p>}{canReview.data && item.status === 'submitted' && item.created_by !== user?.id && <div className="finance-review-actions"><button className="button outline danger-action" disabled={reviewBusy} onClick={() => void review(item.id, false)}>Return with reason</button><button className="button primary" disabled={reviewBusy} onClick={() => void review(item.id, true)}>Publish summary</button></div>}</article>)}{reviewPages > 1 && <nav className="ops-panel ops-form-actions" aria-label="Accomplishment review pages"><span className="field-hint">Page {reviewPage + 1} of {reviewPages} · {reviewItems.data?.totalCount.toLocaleString()} items</span><div className="finance-review-actions"><button className="button outline" disabled={reviewPage === 0 || reviewItems.isFetching} onClick={() => setReviewPage((page) => page - 1)}><ChevronLeft size={16} />Previous</button><button className="button outline" disabled={reviewPage + 1 >= reviewPages || reviewItems.isFetching} onClick={() => setReviewPage((page) => page + 1)}>Next<ChevronRight size={16} /></button></div></nav>}</section>}
  </section>
}
