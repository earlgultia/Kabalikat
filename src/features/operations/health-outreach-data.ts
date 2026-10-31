import { supabase } from '../../lib/supabase'

export type HealthCampaign = {
  id: string
  barangay_id: string
  title: string
  description: string
  location: string
  starts_at: string
  ends_at: string
  status: 'draft' | 'changes_requested' | 'published' | 'completed' | 'cancelled'
  created_by: string
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  completed_at: string | null
  attendance_count: number | null
  cancellation_reason: string | null
}
export type HealthCampaignPage = { rows: HealthCampaign[]; totalCount: number }
export type HealthCampaignSummary = { totalCount: number; completedCount: number; totalAttendance: number; awaitingReviewCount: number; changesRequestedCount: number }
export type HealthCampaignEvent = {
  id: string
  action: string
  note: string
  actor_name: string
  created_at: string
  total_count: number
}
export const HEALTH_CAMPAIGN_PAGE_SIZE = 20
export const HEALTH_CAMPAIGN_EVENT_PAGE_SIZE = 25

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listHealthCampaigns(barangayId: string, page: number, search: string, status: 'all' | HealthCampaign['status']): Promise<HealthCampaignPage> {
  const { data, error } = await client().rpc('list_health_outreach_campaign_page', {
    p_barangay_id: barangayId,
    p_page: page,
    p_page_size: HEALTH_CAMPAIGN_PAGE_SIZE,
    p_search: search.trim().slice(0, 100) || null,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as (HealthCampaign & { total_count: number })[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

export async function listAllHealthCampaigns(barangayId: string, search: string, status: 'all' | HealthCampaign['status']): Promise<HealthCampaign[]> {
  const allRows: HealthCampaign[] = []
  for (let page = 0; ; page += 1) {
    const result = await listHealthCampaigns(barangayId, page, search, status)
    allRows.push(...result.rows)
    if (allRows.length >= result.totalCount || result.rows.length === 0) return allRows
  }
}

export async function getHealthCampaignSummary(barangayId: string, search: string, status: 'all' | HealthCampaign['status']): Promise<HealthCampaignSummary> {
  const { data, error } = await client().rpc('get_health_outreach_campaign_summary', {
    p_barangay_id: barangayId,
    p_search: search.trim().slice(0, 100) || null,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  const row = data?.[0] as { total_count: number; completed_count: number; total_attendance: number; awaiting_review_count: number; changes_requested_count: number } | undefined
  return {
    totalCount: Number(row?.total_count ?? 0),
    completedCount: Number(row?.completed_count ?? 0),
    totalAttendance: Number(row?.total_attendance ?? 0),
    awaitingReviewCount: Number(row?.awaiting_review_count ?? 0),
    changesRequestedCount: Number(row?.changes_requested_count ?? 0),
  }
}

export async function listHealthCampaignEvents(barangayId: string, campaignId: string, page: number) {
  const { data, error } = await client().rpc('list_health_outreach_event_page', {
    p_barangay_id: barangayId,
    p_campaign_id: campaignId,
    p_page: page,
    p_page_size: HEALTH_CAMPAIGN_EVENT_PAGE_SIZE,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as HealthCampaignEvent[]
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
}

export function createHealthCampaign(input: { barangayId: string; title: string; description: string; location: string; startsAt: string; endsAt: string }) {
  return rpc('create_health_outreach_campaign', { p_barangay_id: input.barangayId, p_title: input.title, p_description: input.description, p_location: input.location, p_starts_at: input.startsAt, p_ends_at: input.endsAt })
}

export function reviewHealthCampaign(id: string, approve: boolean, note: string | null) {
  return rpc('review_health_outreach_campaign', { p_campaign_id: id, p_approve: approve, p_note: note })
}

export function updateHealthCampaign(input: { id: string; title: string; description: string; location: string; startsAt: string; endsAt: string }) {
  return rpc('update_health_outreach_campaign', {
    p_campaign_id: input.id,
    p_title: input.title,
    p_description: input.description,
    p_location: input.location,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
  })
}

export function completeHealthCampaign(id: string, attendanceCount: number) {
  return rpc('complete_health_outreach_campaign', { p_campaign_id: id, p_attendance_count: attendanceCount })
}

export function cancelHealthCampaign(id: string, reason: string) {
  return rpc('cancel_health_outreach_campaign', { p_campaign_id: id, p_reason: reason })
}
