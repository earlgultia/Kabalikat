import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Eye, Globe2, RefreshCw, UsersRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ErrorNotice, LoadingNotice, PageHeading } from './shared'
import './site-analytics.css'

type AnalyticsPoint = { period_start: string; visitors: number; page_views: number }
type TopPage = { page_key: string; page_views: number; unique_visitors: number }
type AnalyticsResult = {
  summary: { total_visitors: number; today_visitors: number; total_page_views: number; live_visitors: number }
  daily: AnalyticsPoint[]
  weekly: AnalyticsPoint[]
  monthly: AnalyticsPoint[]
  top_pages: TopPage[]
}

const sectionLabels: Record<string, string> = { home: 'Landing page', features: 'What it does', plans: 'Plans', 'how-it-works': 'Getting started', privacy: 'Data privacy' }

function formatPeriodLabel(periodStart: string, period: 'daily' | 'weekly' | 'monthly') {
  const options: Intl.DateTimeFormatOptions = period === 'monthly'
    ? { month: 'short', year: '2-digit', timeZone: 'Asia/Manila' }
    : { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }
  return new Intl.DateTimeFormat('en-PH', options).format(new Date(`${periodStart}T12:00:00+08:00`))
}

async function loadSiteAnalytics(): Promise<AnalyticsResult> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('get_platform_site_visitor_analytics')
  if (error) throw error
  return data as AnalyticsResult
}

export function SiteAnalyticsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const analytics = useQuery({ queryKey: ['platform-public-site-analytics'], queryFn: loadSiteAnalytics, refetchInterval: 60_000, staleTime: 30_000 })
  const refetchAnalytics = analytics.refetch

  useEffect(() => {
    if (!supabase) return
    const channel = supabase.channel('platform-public-site-analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visitor_public_metrics' }, () => { void refetchAnalytics() })
      .subscribe()
    return () => { void supabase?.removeChannel(channel) }
  }, [refetchAnalytics])

  const data = analytics.data
  const points = data?.[period] ?? []
  const maxValue = Math.max(1, ...points.map((point) => Math.max(point.visitors, point.page_views)))

  return <section className="operation-page site-analytics-page">
    <PageHeading title="Website analytics" description="Aggregate traffic for the public KABALIKAT landing page. Visitor-level identifiers are not shown here." />
    <div className="ops-panel site-analytics-privacy"><Globe2 size={18} /><p><strong>Public-site data only.</strong> These counts are separate from barangay workspaces. Visitors use a random browser identifier that can be reset by clearing browser site data. No names, email addresses, or barangay membership are included.</p></div>
    {analytics.isPending ? <LoadingNotice /> : analytics.error ? <ErrorNotice message="Unable to load website analytics." onRetry={() => void analytics.refetch()} retrying={analytics.isFetching} /> : data && <>
      <div className="site-analytics-summary" aria-label="Website traffic summary">
        <article><span><UsersRound size={19} /></span><small>Unique browsers, all time</small><strong>{data.summary.total_visitors.toLocaleString()}</strong></article>
        <article><span><UsersRound size={19} /></span><small>Unique browsers today</small><strong>{data.summary.today_visitors.toLocaleString()}</strong></article>
        <article><span><Eye size={19} /></span><small>Landing section views</small><strong>{data.summary.total_page_views.toLocaleString()}</strong></article>
        <article><span className="live-pulse"><Activity size={19} /></span><small>Live now (2 minute window)</small><strong>{data.summary.live_visitors.toLocaleString()}</strong></article>
      </div>
      <section className="ops-panel site-analytics-chart" aria-labelledby="site-traffic-heading">
        <div className="site-analytics-chart-heading"><div><h2 id="site-traffic-heading">Visitor activity</h2><p>Unique browsers and page-section views by Manila date.</p></div><div className="site-analytics-toolbar"><label className="site-period-select">Period<select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="daily">Daily · 30 days</option><option value="weekly">Weekly · 12 weeks</option><option value="monthly">Monthly · 12 months</option></select></label><button type="button" className="button outline" disabled={analytics.isFetching} onClick={() => void analytics.refetch()}><RefreshCw size={15} />Refresh</button></div></div>
        <div className="site-analytics-legend"><span><i className="visitor-legend" />Unique browsers</span><span><i className="views-legend" />Page-section views</span></div>
        <div className="site-analytics-bars" role="img" aria-label={`${period} chart of visitors and page views`}>
          {points.map((point) => <div className="site-analytics-bar-group" key={point.period_start} title={`${point.period_start}: ${point.visitors} unique browsers, ${point.page_views} page views`}><div className="site-analytics-bars-pair"><span className="site-analytics-bar visitors" style={{ height: `${Math.max(point.visitors ? 3 : 0, point.visitors / maxValue * 100)}%` }} /><span className="site-analytics-bar views" style={{ height: `${Math.max(point.page_views ? 3 : 0, point.page_views / maxValue * 100)}%` }} /></div><small>{formatPeriodLabel(point.period_start, period)}</small></div>)}
        </div>
        <details className="site-analytics-data">
          <summary>View exact traffic values</summary>
          <div className="site-analytics-table-wrap">
            <table>
              <caption>{period[0].toUpperCase() + period.slice(1)} landing-page traffic</caption>
              <thead><tr><th scope="col">Period</th><th scope="col">Unique browsers</th><th scope="col">Page-section views</th></tr></thead>
              <tbody>{points.map((point) => <tr key={point.period_start}><th scope="row">{formatPeriodLabel(point.period_start, period)}</th><td>{point.visitors.toLocaleString()}</td><td>{point.page_views.toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
        {!points.some((point) => point.visitors || point.page_views) && <p className="site-analytics-empty">No landing-page activity has been recorded yet.</p>}
      </section>
      <section className="ops-panel site-top-pages" aria-labelledby="site-top-pages-heading"><div><h2 id="site-top-pages-heading">Top visited sections</h2><p>Only allowlisted public landing-page sections are counted.</p></div>{data.top_pages.length ? <div className="site-top-pages-list">{data.top_pages.map((page, index) => <article key={page.page_key}><span className="site-top-pages-rank">{index + 1}</span><div><strong>{sectionLabels[page.page_key] ?? page.page_key}</strong><small>{page.unique_visitors.toLocaleString()} unique browsers</small></div><strong>{page.page_views.toLocaleString()} views</strong></article>)}</div> : <p className="site-analytics-empty">No section views have been recorded yet.</p>}</section>
    </>}
  </section>
}
