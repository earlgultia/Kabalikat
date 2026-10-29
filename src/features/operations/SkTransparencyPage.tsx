import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Award, Download, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { hasPermission } from './data'
import { listSkAccomplishments } from './sk-data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'
import { encodeCsv } from './csv'

export function SkTransparencyPage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'sk.manage'], queryFn: () => hasPermission(tenantId, 'sk.manage'), enabled: Boolean(tenantId) })
  const canReview = useQuery({ queryKey: ['permission', tenantId, 'sk.review'], queryFn: () => hasPermission(tenantId, 'sk.review'), enabled: Boolean(tenantId) })
  const items = useQuery({ queryKey: ['sk-accomplishments', tenantId], queryFn: () => listSkAccomplishments(tenantId), enabled: Boolean(tenantId) })
  const [year, setYear] = useState('all')
  const years = useMemo(() => [...new Set((items.data ?? []).filter((item) => item.status === 'published' && item.published_at).map((item) => new Date(item.published_at!).getFullYear().toString()))].sort((a, b) => Number(b) - Number(a)), [items.data])
  const published = (items.data ?? []).filter((item) => item.status === 'published' && (year === 'all' || (item.published_at && new Date(item.published_at).getFullYear().toString() === year)))
  const reviewQueue = (items.data ?? []).filter((item) => item.status !== 'published' && (canManage.data || canReview.data))

  function exportCsv() {
    const rows = [['Published', 'Title', 'Summary'], ...published.map((item) => [
      item.published_at ? new Date(item.published_at).toLocaleDateString() : '', item.title, item.summary,
    ])]
    const blob = new Blob([encodeCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `kabalikat-sk-accomplishments-${year === 'all' ? 'all-years' : year}.csv`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return <section className="operation-page">
    <PageHeading title="SK accomplishments" description="Captain-approved summaries of completed youth projects.">
      <button className="button outline" onClick={exportCsv} disabled={!published.length}><Download size={16} />Export published summaries</button>
    </PageHeading>
    <div className="ops-panel referral-privacy-notice"><ShieldAlert size={18} /><p><strong>Reviewed before publication.</strong> Only the submitted title and summary are shown here. Do not include personal details, participant names, or private financial information.</p></div>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to view published SK accomplishments." />}
    {Boolean(tenantId) && (canManage.isPending || canReview.isPending) && <LoadingNotice compact />}
    {(canManage.error || canReview.error) && <ErrorNotice message="SK review access could not be checked. Published summaries remain available; internal review items are hidden until access can be verified." />}
    {items.isPending && tenantId && <LoadingNotice />}{items.error && <ErrorNotice message="Unable to load SK accomplishment summaries." />}
    {items.data && <div className="ops-filter-row"><label>Publication year<select aria-label="Filter accomplishments by publication year" value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{years.map((itemYear) => <option key={itemYear} value={itemYear}>{itemYear}</option>)}</select></label><span className="field-hint">CSV export contains only the published summaries shown here.</span></div>}
    {published.length === 0 && !items.isPending && <div className="ops-empty"><Award size={22} /><strong>No published accomplishments for this period</strong><p>Approved summaries will appear here after independent Captain review.</p></div>}
    <div className="sk-project-list">{published.map((item) => <article className="ops-panel sk-project-card" key={item.id}><div className="sk-project-header"><div><StatusPill status={item.status} /><h2>{item.title}</h2><p>{item.summary}</p></div><Award size={22} /></div><div className="sk-project-meta"><span>{item.published_at ? `Published ${formatDateTime(item.published_at)}` : ''}</span></div></article>)}</div>
    {reviewQueue.length > 0 && <section className="sk-project-list"><h2>Internal review queue</h2>{reviewQueue.map((item) => <article className="ops-panel sk-project-card" key={item.id}><div className="sk-project-header"><div><StatusPill status={item.status} /><h3>{item.title}</h3><p>{item.summary}</p></div></div><div className="sk-project-meta"><span>Submitted {formatDateTime(item.created_at)}</span></div>{item.review_note && <p className="finance-review-note">Captain’s note: {item.review_note}</p>}</article>)}</section>}
  </section>
}
