import { supabase } from '../../lib/supabase'

export type ReferralDestination = { id: string; name: string; municipality: string; province: string; code: string }
export type InterbarangayReferral = {
  id: string; origin_barangay_id: string; origin_name: string; receiving_barangay_id: string; receiving_name: string
  purpose: string; disclosure_basis: string; shared_information: string; incident_id: string | null
  status: 'submitted' | 'acknowledged' | 'responded' | 'declined' | 'closed'; created_at: string
  acknowledged_at: string | null; responded_at: string | null; response: string | null; closed_at: string | null
  viewer_side: 'origin' | 'receiving'
}
export type InterbarangayReferralActivity = { referral_id: string; action: string; actor_name: string; created_at: string }

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listReferralDestinations(originId: string) {
  const { data, error } = await client().rpc('get_referral_destinations', { p_origin_barangay_id: originId })
  if (error) throw new Error(error.message)
  return (data ?? []) as ReferralDestination[]
}

export async function listInterbarangayReferrals() {
  const { data, error } = await client().rpc('list_interbarangay_referrals')
  if (error) throw new Error(error.message)
  return (data ?? []) as InterbarangayReferral[]
}

export async function listInterbarangayReferralActivity(): Promise<InterbarangayReferralActivity[]> {
  const { data, error } = await client().rpc('list_interbarangay_referral_activity')
  if (error) throw new Error(error.message)
  return (data ?? []) as InterbarangayReferralActivity[]
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
}

export function createInterbarangayReferral(input: { originId: string; destinationId: string; purpose: string; basis: string; information: string; incidentId: string; confirmed: boolean }) {
  return rpc('create_interbarangay_referral', {
    p_origin_barangay_id: input.originId, p_receiving_barangay_id: input.destinationId, p_purpose: input.purpose,
    p_disclosure_basis: input.basis, p_shared_information: input.information, p_incident_id: input.incidentId || null,
    p_confirmed: input.confirmed,
  })
}

export function acknowledgeReferral(id: string) { return rpc('acknowledge_interbarangay_referral', { p_referral_id: id }) }
export function respondReferral(id: string, response: string) { return rpc('respond_interbarangay_referral', { p_referral_id: id, p_response: response }) }
export function declineReferral(id: string, reason: string) { return rpc('decline_interbarangay_referral', { p_referral_id: id, p_reason: reason }) }
export function closeReferral(id: string) { return rpc('close_interbarangay_referral', { p_referral_id: id }) }
