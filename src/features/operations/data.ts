import { supabase } from '../../lib/supabase'

export type ResidentRow = {
  id: string
  first_name: string
  last_name: string
  birth_date: string | null
  phone: string | null
  record_status: 'active' | 'inactive' | 'deceased'
  household_id: string | null
  household: { household_code: string; address_line: string; purok: string | null } | null
}
export type ResidencyVerificationRow = { resident_id: string; status: string; reason: string | null; created_at: string }
export type ResidentProfileChangeRequest = {
  id: string; resident_id: string; proposed_first_name: string | null; proposed_last_name: string | null
  proposed_phone: string | null; request_note: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  review_reason: string | null; created_at: string; reviewed_at: string | null
  resident: { first_name: string; last_name: string } | null
}
export type ResidentPersonalDataExport = {
  export_version: 1
  exported_at: string
  profile: {
    first_name: string; middle_name: string | null; last_name: string; suffix: string | null
    birth_date: string | null; phone: string | null; record_status: string
  }
  household: { household_code: string; address_line: string; purok: string | null } | null
  residency_checks: Array<{ status: string; created_at: string }>
  profile_correction_requests: Array<{
    requested_changes: { first_name: string | null; last_name: string | null; phone: string | null }
    request_note: string | null; status: string; submitted_at: string; reviewed_at: string | null; decision_note: string | null
  }>
  document_requests: Array<{
    reference_number: string; document_type: string | null; purpose: string; status: string; submitted_at: string
    issued_document: { issuance_number: string; issued_at: string; expires_at: string | null; status: string } | null
  }>
  incident_reports: Array<{
    category: string; severity: string; location: string; summary: string; details: string
    status: string; resolution_note: string | null; submitted_at: string
    status_history: Array<{ action: string; created_at: string }>
  }>
  community_feedback: Array<{
    category: string; subject: string; message: string; status: string; staff_response: string | null
    submitted_at: string; updated_at: string
    history: Array<{ action: string; note: string; created_at: string }>
  }>
}
export type HouseholdRow = { id: string; household_code: string; address_line: string; purok: string | null }

export type InvitationRow = { id: string; invited_email: string; status: string; expires_at: string; created_at: string }
export type DocumentTypeRow = { id: string; code: string; name: string; description: string; requirements: string[]; public_request_enabled: boolean }
export type DocumentTypeActivityRow = {
  activity_id: string; document_type_id: string; document_type_name: string; action: 'created' | 'updated'
  actor_name: string; previous_values: Record<string, unknown> | null; new_values: Record<string, unknown>; created_at: string
}
export type DocumentRequestRow = {
  id: string; reference_number: string; purpose: string; status: string; submitted_at: string; rejection_reason: string | null
  document_type: { name: string } | null
  resident: { first_name: string; last_name: string; user_id: string | null } | null
  issued: { issuance_number: string; issued_at: string; expires_at: string | null; verification_status: string; events: Array<{ id: string; action: string; reason: string; created_at: string }> } | null
}
export type DocumentRequestActivityRow = { request_id: string; from_status: string | null; to_status: string; reason: string | null; actor_name: string; created_at: string }
export type AnnouncementRow = {
  id: string; title: string; body: string; audience: 'public' | 'residents' | 'officials' | 'role'; audience_role_id: string | null
  status: 'draft' | 'published' | 'archived'; published_at: string | null; expires_at: string | null; created_at: string
}
export type AnnouncementAudienceRole = { id: string; key: string; label: string }
export type MeetingRow = {
  id: string; title: string; location: string; starts_at: string; ends_at: string | null
  agenda: string; status: 'draft' | 'scheduled' | 'completed' | 'cancelled'
}
export type AttendanceRow = { user_id: string; status: string; source: string; recorded_at: string }
export type MeetingAttendeeRow = { user_id: string }
export type MeetingMinutesRow = { id: string; content: string; status: 'draft' | 'reviewed'; updated_at: string }
export type MeetingResolutionRow = {
  id: string; resolution_number: string; title: string; content: string
  status: 'draft' | 'approved'; created_at: string; approved_at: string | null
}
export type MemberRow = { user_id: string; role: { label: string } | null; profile: { display_name: string } | null }
export type ArchiveFolderRow = { id: string; parent_id: string | null; name: string }
export type ArchiveDocumentRow = {
  id: string; folder_id: string | null; file_name: string; description: string; category: string
  mime_type: string; file_size: number; storage_path: string; extracted_text: string
  text_status: 'not_added' | 'draft' | 'reviewed'; created_at: string
}
export type FinanceBudgetRow = {
  id: string; fiscal_year: number; name: string; amount: number; status: 'draft' | 'approved'
  created_by: string; approved_by: string | null; created_at: string; approved_at: string | null
}
export type FinancialTransactionRow = {
  id: string; budget_id: string; transaction_type: 'income' | 'expense'; category: string; description: string
  amount: number; transaction_date: string; status: 'submitted' | 'posted' | 'rejected' | 'voided'
  submitted_by: string; reviewed_by: string | null; review_note: string | null; created_at: string
  void_reason: string | null; voided_at: string | null
  budget: { name: string; fiscal_year: number } | null
}
export type FinancialReceiptRow = { id: string; transaction_id: string; file_name: string; mime_type: string; file_size: number; storage_path: string; created_at: string }
export type FinanceBudgetAmendmentRow = {
  id: string; budget_id: string; requested_amount: number; reason: string; status: 'pending' | 'approved' | 'rejected'
  requested_by: string; reviewed_by: string | null; review_note: string | null; created_at: string
}
export type WorkspaceDashboardMetrics = {
  residents: number | null; pending_documents: number | null; upcoming_meetings: number | null
  pending_finance: number | null; published_announcements: number | null; generated_at: string
}
export type FinancialAdjustmentRow = {
  id: string; transaction_id: string; amount_change: number; reason: string; status: 'pending' | 'approved' | 'rejected'
  requested_by: string; reviewed_by: string | null; review_note: string | null; created_at: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function rows<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  // The selected columns and relationships are declared alongside each query below.
  return (data ?? []) as T[]
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export function hasPermission(tenantId: string, permission: string) {
  return rpc<boolean>('has_tenant_permission', { p_barangay_id: tenantId, p_permission: permission })
}

export function getWorkspaceDashboardMetrics(tenantId: string) {
  return rpc<WorkspaceDashboardMetrics>('get_workspace_dashboard_metrics', { p_barangay_id: tenantId })
}

export function listResidents(tenantId: string) {
  return rows<ResidentRow>(client().from('residents')
    .select('id,first_name,last_name,birth_date,phone,record_status,household_id,household:households(household_code,address_line,purok)')
    .eq('barangay_id', tenantId).order('last_name'))
}

export const RESIDENT_PAGE_SIZE = 25

export async function listResidentsPage(tenantId: string, page: number, search: string, verificationStatus: string) {
  const { data, error } = await client().rpc('list_resident_directory_page', {
    p_barangay_id: tenantId,
    p_page: page,
    p_page_size: RESIDENT_PAGE_SIZE,
    p_search: search.trim() || null,
    p_verification_status: verificationStatus,
  })
  if (error) throw new Error(error.message)
  const result = (data ?? []) as Array<{
    id: string; first_name: string; last_name: string; birth_date: string | null; phone: string | null
    record_status: ResidentRow['record_status']; household_id: string | null; household_code: string | null
    address_line: string | null; purok: string | null; verification_status: string; total_count: number
  }>
  return {
    residents: result.map((resident): ResidentRow => ({
      id: resident.id, first_name: resident.first_name, last_name: resident.last_name,
      birth_date: resident.birth_date, phone: resident.phone, record_status: resident.record_status,
      household_id: resident.household_id,
      household: resident.household_code && resident.address_line !== null
        ? { household_code: resident.household_code, address_line: resident.address_line, purok: resident.purok }
        : null,
    })),
    verificationStatuses: Object.fromEntries(result.map((resident) => [resident.id, resident.verification_status])) as Record<string, string>,
    total: Number(result[0]?.total_count ?? 0),
  }
}

export async function getOwnResidentDataExport(tenantId: string): Promise<ResidentPersonalDataExport> {
  const supabaseClient = client()
  const { data: userData, error: userError } = await supabaseClient.auth.getUser()
  if (userError || !userData.user) throw new Error('Sign in again to download your data.')
  const { data: resident, error: residentError } = await supabaseClient.from('residents')
    .select('id,first_name,middle_name,last_name,suffix,birth_date,phone,record_status,household:households(household_code,address_line,purok)')
    .eq('barangay_id', tenantId).eq('user_id', userData.user.id).maybeSingle()
  if (residentError) throw new Error(residentError.message)
  if (!resident) throw new Error('No resident profile is linked to this account in the selected barangay.')

  const { data: ownedVerifications, error: ownVerificationError } = await supabaseClient.from('residency_verifications')
    .select('status,created_at').eq('barangay_id', tenantId).eq('resident_id', resident.id)
  if (ownVerificationError) throw new Error(ownVerificationError.message)
  const { data: ownedRequests, error: ownRequestsError } = await supabaseClient.from('document_requests')
    .select('reference_number,purpose,status,submitted_at,document_type:document_types(name),issued:issued_documents(issuance_number,issued_at,expires_at,verification_status)')
    .eq('barangay_id', tenantId).eq('resident_id', resident.id).order('submitted_at', { ascending: false })
  if (ownRequestsError) throw new Error(ownRequestsError.message)
  const { data: ownCorrections, error: ownCorrectionsError } = await supabaseClient.from('resident_profile_change_requests')
    .select('proposed_first_name,proposed_last_name,proposed_phone,request_note,status,review_reason,created_at,reviewed_at')
    .eq('barangay_id', tenantId).eq('resident_id', resident.id).order('created_at', { ascending: false })
  if (ownCorrectionsError) throw new Error(ownCorrectionsError.message)

  const { data: incidentPermission, error: incidentPermissionError } = await supabaseClient.rpc('has_tenant_permission', {
    p_barangay_id: tenantId, p_permission: 'incident.report',
  })
  if (incidentPermissionError) throw new Error(incidentPermissionError.message)
  const ownIncidents = incidentPermission
    ? await rows<{
        id: string; category: string; severity: string; location: string; summary: string; details: string
        status: string; resolution_note: string | null; created_at: string
      }>(supabaseClient.from('incidents')
        .select('id,category,severity,location,summary,details,status,resolution_note,created_at')
        .eq('barangay_id', tenantId).eq('created_by', userData.user.id).order('created_at', { ascending: false }))
    : []
  const ownIncidentEvents = incidentPermission
    ? await rpc<Array<{ incident_id: string; action: string; created_at: string }>>('get_own_incident_status_events', { p_barangay_id: tenantId })
    : []
  const ownFeedback = await rpc<Array<{
    id: string; category: string; subject: string; message: string; status: string
    staff_response: string | null; created_at: string; updated_at: string
    history: Array<{ action: string; note: string; created_at: string }>
  }>>('get_own_community_feedback_export', { p_barangay_id: tenantId })

  const household = Array.isArray(resident.household) ? resident.household[0] : resident.household
  return {
    export_version: 1,
    exported_at: new Date().toISOString(),
    profile: {
      first_name: resident.first_name, middle_name: resident.middle_name, last_name: resident.last_name,
      suffix: resident.suffix, birth_date: resident.birth_date, phone: resident.phone, record_status: resident.record_status,
    },
    household: household ?? null,
    residency_checks: (ownedVerifications ?? []).map((entry) => ({ status: entry.status, created_at: entry.created_at })),
    profile_correction_requests: (ownCorrections ?? []).map((request) => ({
      requested_changes: {
        first_name: request.proposed_first_name, last_name: request.proposed_last_name, phone: request.proposed_phone,
      },
      request_note: request.request_note, status: request.status, submitted_at: request.created_at,
      reviewed_at: request.reviewed_at, decision_note: request.review_reason,
    })),
    document_requests: (ownedRequests ?? []).map((request) => {
      const documentType = Array.isArray(request.document_type) ? request.document_type[0] : request.document_type
      const issued = Array.isArray(request.issued) ? request.issued[0] : request.issued
      return {
        reference_number: request.reference_number, document_type: documentType?.name ?? null,
        purpose: request.purpose, status: request.status, submitted_at: request.submitted_at,
        issued_document: issued ? {
          issuance_number: issued.issuance_number, issued_at: issued.issued_at, expires_at: issued.expires_at,
          status: issued.verification_status,
        } : null,
      }
    }),
    incident_reports: ownIncidents.map((incident) => ({
      category: incident.category, severity: incident.severity, location: incident.location,
      summary: incident.summary, details: incident.details, status: incident.status,
      resolution_note: incident.resolution_note, submitted_at: incident.created_at,
      status_history: ownIncidentEvents.filter((entry) => entry.incident_id === incident.id)
        .map(({ action, created_at }) => ({ action, created_at })),
    })),
    community_feedback: ownFeedback.map((feedback) => ({
      category: feedback.category, subject: feedback.subject, message: feedback.message,
      status: feedback.status, staff_response: feedback.staff_response,
      submitted_at: feedback.created_at, updated_at: feedback.updated_at,
      history: feedback.history,
    })),
  }
}

export function listHouseholds(tenantId: string) {
  return rows<HouseholdRow>(client().from('households')
    .select('id,household_code,address_line,purok').eq('barangay_id', tenantId).order('household_code'))
}

export function registerResident(input: {
  tenantId: string; firstName: string; lastName: string; birthDate: string; phone: string; address: string; purok: string; householdId: string
}) {
  return rpc<string>('register_resident', {
    p_barangay_id: input.tenantId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_birth_date: input.birthDate || null,
    p_phone: input.phone || null,
    p_household_id: input.householdId || null,
    p_user_id: null,
    p_address_line: input.address,
    p_purok: input.purok || null,
  })
}

export function verifyResident(residentId: string, status: 'verified' | 'rejected', reason: string) {
  return rpc<string>('verify_residency', { p_resident_id: residentId, p_status: status, p_reason: reason || null })
}

export function listResidentProfileChangeRequests(tenantId: string) {
  return rows<ResidentProfileChangeRequest>(client().from('resident_profile_change_requests')
    .select('id,resident_id,proposed_first_name,proposed_last_name,proposed_phone,request_note,status,review_reason,created_at,reviewed_at,resident:residents(first_name,last_name)')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }))
}

export function submitResidentProfileChange(input: {
  residentId: string; firstName: string | null; lastName: string | null; phone: string | null; note: string
}) {
  return rpc<string>('submit_resident_profile_change', {
    p_resident_id: input.residentId, p_first_name: input.firstName, p_last_name: input.lastName,
    p_phone: input.phone, p_note: input.note || null,
  })
}

export function reviewResidentProfileChange(requestId: string, decision: 'approved' | 'rejected', reason: string) {
  return rpc<void>('review_resident_profile_change', { p_request_id: requestId, p_decision: decision, p_reason: reason || null })
}

export function cancelResidentProfileChange(requestId: string) {
  return rpc<void>('cancel_resident_profile_change', { p_request_id: requestId })
}

export function listResidencyVerifications(tenantId: string, residentIds?: string[]) {
  let request = client().from('residency_verifications')
    .select('resident_id,status,reason,created_at').eq('barangay_id', tenantId).order('created_at', { ascending: false })
  if (residentIds) {
    if (residentIds.length === 0) return Promise.resolve([] as ResidencyVerificationRow[])
    request = request.in('resident_id', residentIds)
  }
  return rows<ResidencyVerificationRow>(request)
}

export const INVITATION_PAGE_SIZE = 20

export async function listInvitationPage(tenantId: string, page: number) {
  const from = Math.max(0, page) * INVITATION_PAGE_SIZE
  const { data, error, count } = await client().from('invitations')
    .select('id,invited_email,status,expires_at,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + INVITATION_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { invitations: (data ?? []) as InvitationRow[], total: count ?? 0 }
}

export async function createInvitation(tenantId: string, email: string, roleKey: string) {
  const result = await rpc<Array<{ invitation_id: string; invitation_token: string; expires_at: string }>>(
    'create_membership_invitation', { p_barangay_id: tenantId, p_email: email, p_role_key: roleKey },
  )
  if (!result?.[0]) throw new Error('The invitation was not created.')
  return result[0]
}

export function revokeInvitation(invitationId: string) {
  return rpc<void>('revoke_membership_invitation', { p_invitation_id: invitationId })
}

export function acceptInvitation(token: string) {
  return rpc<string>('accept_membership_invitation', { p_token: token })
}

export function listDocumentTypes(tenantId: string) {
  return rows<DocumentTypeRow>(client().from('document_types')
    .select('id,code,name,description,requirements,public_request_enabled').eq('barangay_id', tenantId).order('name'))
}

export function listDocumentTypeActivity(tenantId: string) {
  return rpc<DocumentTypeActivityRow[]>('list_document_type_activity', { p_barangay_id: tenantId })
}

export function createDocumentType(input: {
  tenantId: string; code: string; name: string; description: string; requirements: string[]; publicRequestEnabled: boolean
}) {
  return rpc<string>('create_document_type', {
    p_barangay_id: input.tenantId, p_code: input.code, p_name: input.name,
    p_description: input.description, p_requirements: input.requirements,
    p_public_request_enabled: input.publicRequestEnabled,
  })
}

export function updateDocumentType(input: {
  typeId: string; name: string; description: string; requirements: string[]; publicRequestEnabled: boolean
}) {
  return rpc<void>('update_document_type', {
    p_document_type_id: input.typeId, p_name: input.name, p_description: input.description,
    p_requirements: input.requirements, p_public_request_enabled: input.publicRequestEnabled,
  })
}

export const DOCUMENT_REQUEST_PAGE_SIZE = 25

export async function listDocumentRequestsPage(tenantId: string, page: number, search: string, status: string) {
  const { data: pageData, error: pageError } = await client().rpc('list_document_request_page', {
    p_barangay_id: tenantId, p_page: page, p_page_size: DOCUMENT_REQUEST_PAGE_SIZE,
    p_search: search.trim() || null, p_status: status,
  })
  if (pageError) throw new Error(pageError.message)
  const pageRows = (pageData ?? []) as Array<{ request_id: string; total_count: number }>
  if (!pageRows.length) return { requests: [] as DocumentRequestRow[], total: 0 }
  const orderedIds = pageRows.map((row) => row.request_id)
  const requests = await rows<DocumentRequestRow>(client().from('document_requests')
    .select('id,reference_number,purpose,status,submitted_at,rejection_reason,document_type:document_types(name),resident:residents(first_name,last_name,user_id),issued:issued_documents(issuance_number,issued_at,expires_at,verification_status,events:issued_document_events(id,action,reason,created_at))')
    .eq('barangay_id', tenantId).in('id', orderedIds))
  const byId = new Map(requests.map((request) => [request.id, request]))
  return { requests: orderedIds.map((id) => byId.get(id)).filter((request): request is DocumentRequestRow => Boolean(request)), total: Number(pageRows[0]?.total_count ?? 0) }
}

export async function listDocumentRequestActivity(tenantId: string, requestIds: string[]): Promise<DocumentRequestActivityRow[]> {
  if (requestIds.length === 0) return []
  const { data, error } = await client().rpc('list_document_request_page_activity', {
    p_barangay_id: tenantId, p_request_ids: requestIds,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as DocumentRequestActivityRow[]
}

export async function createDocumentRequest(tenantId: string, residentId: string, typeId: string, purpose: string) {
  const result = await rpc<Array<{ request_id: string; reference_number: string }>>('create_document_request', {
    p_barangay_id: tenantId, p_resident_id: residentId, p_document_type_id: typeId, p_purpose: purpose,
  })
  if (!result?.[0]) throw new Error('The document request was not submitted.')
  return result[0]
}

export function transitionDocumentRequest(requestId: string, status: string, reason: string) {
  return rpc<void>('transition_document_request', { p_request_id: requestId, p_next_status: status, p_reason: reason || null })
}

export function revokeIssuedDocument(requestId: string, reason: string) {
  return rpc<void>('revoke_issued_document', { p_request_id: requestId, p_reason: reason })
}

export function resubmitDocumentRequest(requestId: string, purpose: string) {
  return rpc<void>('resubmit_document_request', { p_request_id: requestId, p_purpose: purpose })
}

export const ANNOUNCEMENT_PAGE_SIZE = 20

export async function listAnnouncementPage(tenantId: string, page: number) {
  const from = Math.max(0, page) * ANNOUNCEMENT_PAGE_SIZE
  const { data, error, count } = await client().from('announcements')
    .select('id,title,body,audience,audience_role_id,status,published_at,expires_at,created_at', { count: 'exact' })
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + ANNOUNCEMENT_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { announcements: (data ?? []) as AnnouncementRow[], total: count ?? 0 }
}

export function listRecentAnnouncements(tenantId: string) {
  return rows<AnnouncementRow>(client().from('announcements')
    .select('id,title,body,audience,audience_role_id,status,published_at,expires_at,created_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100))
}

export function listAnnouncementAudienceRoles() {
  return rows<AnnouncementAudienceRole>(client().from('role_definitions').select('id,key,label')
    .eq('scope', 'barangay').order('label'))
}

export function createAnnouncement(input: {
  tenantId: string; authorId: string; title: string; body: string; audience: string; audienceRoleId: string | null; publish: boolean
}) {
  const now = input.publish ? new Date().toISOString() : null
  return client().from('announcements').insert({
    barangay_id: input.tenantId, created_by: input.authorId, title: input.title, body: input.body,
    audience: input.audience, audience_role_id: input.audienceRoleId, status: input.publish ? 'published' : 'draft', published_at: now,
  }).then(({ error }) => { if (error) throw new Error(error.message) })
}

export function updateAnnouncementStatus(id: string, status: 'published' | 'archived') {
  return client().from('announcements').update({
    status, published_at: status === 'published' ? new Date().toISOString() : null,
  }).eq('id', id).then(({ error }) => { if (error) throw new Error(error.message) })
}

export const MEETING_PAGE_SIZE = 20

export async function listMeetingPage(tenantId: string, page: number) {
  const from = Math.max(0, page) * MEETING_PAGE_SIZE
  const { data, error, count } = await client().from('meetings')
    .select('id,title,location,starts_at,ends_at,agenda,status', { count: 'exact' })
    .eq('barangay_id', tenantId).order('starts_at', { ascending: false }).order('id', { ascending: false })
    .range(from, from + MEETING_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { meetings: (data ?? []) as MeetingRow[], total: count ?? 0 }
}

export function listTenantMembers(tenantId: string) {
  return rows<MemberRow>(client().from('barangay_memberships')
    .select('user_id,role:role_definitions(label),profile:profiles(display_name)')
    .eq('barangay_id', tenantId).eq('status', 'active'))
}

export function createMeeting(input: {
  tenantId: string; title: string; location: string; startsAt: string; endsAt: string; agenda: string; attendeeIds: string[]
}) {
  return rpc<string>('create_meeting', {
    p_barangay_id: input.tenantId, p_title: input.title, p_location: input.location,
    p_starts_at: input.startsAt, p_ends_at: input.endsAt || null, p_agenda: input.agenda,
    p_attendee_ids: input.attendeeIds,
  })
}

export function listAttendance(meetingId: string) {
  return rows<AttendanceRow>(client().from('attendance_records')
    .select('user_id,status,source,recorded_at').eq('meeting_id', meetingId).order('recorded_at'))
}

export function listMeetingAttendees(meetingId: string) {
  return rows<MeetingAttendeeRow>(client().from('meeting_attendees')
    .select('user_id').eq('meeting_id', meetingId).order('user_id'))
}

export function markAttendance(meetingId: string) {
  return rpc<void>('mark_meeting_attendance', { p_meeting_id: meetingId, p_status: 'present' })
}

export function createMeetingAttendanceToken(meetingId: string) {
  return rpc<{ token: string; expires_at: string }>('create_meeting_attendance_token', { p_meeting_id: meetingId })
}

export function checkInWithMeetingQr(meetingId: string, token: string) {
  return rpc<void>('check_in_with_meeting_qr', { p_meeting_id: meetingId, p_token: token })
}

export function recordAttendance(meetingId: string, userId: string, status: 'present' | 'absent' | 'excused', reason: string) {
  return rpc<void>('mark_meeting_attendance', {
    p_meeting_id: meetingId, p_user_id: userId, p_status: status, p_reason: reason || null,
  })
}

export function updateMeetingStatus(id: string, status: 'completed' | 'cancelled', reason = '') {
  return rpc<void>('update_meeting_status', { p_meeting_id: id, p_next_status: status, p_reason: reason || null })
}

export async function getMeetingMinutes(meetingId: string) {
  const { data, error } = await client().from('meeting_minutes')
    .select('id,content,status,updated_at').eq('meeting_id', meetingId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as MeetingMinutesRow | null
}

export function listMeetingResolutions(meetingId: string) {
  return rows<MeetingResolutionRow>(client().from('meeting_resolutions')
    .select('id,resolution_number,title,content,status,created_at,approved_at')
    .eq('meeting_id', meetingId).order('created_at', { ascending: false }))
}

export function saveMeetingMinutes(meetingId: string, content: string, reviewed: boolean) {
  return rpc<string>('save_meeting_minutes', { p_meeting_id: meetingId, p_content: content, p_reviewed: reviewed })
}

export function createMeetingResolution(meetingId: string, title: string, content: string) {
  return rpc<string>('create_meeting_resolution', { p_meeting_id: meetingId, p_title: title, p_content: content })
}

export function approveMeetingResolution(resolutionId: string) {
  return rpc<void>('approve_meeting_resolution', { p_resolution_id: resolutionId })
}

export function listFinanceBudgets(tenantId: string) {
  return rows<FinanceBudgetRow>(client().from('finance_budgets')
    .select('id,fiscal_year,name,amount,status,created_by,approved_by,created_at,approved_at')
    .eq('barangay_id', tenantId).order('fiscal_year', { ascending: false }).order('name'))
}

export function listFinanceBudgetAmendments(tenantId: string) {
  return rows<FinanceBudgetAmendmentRow>(client().from('finance_budget_amendments')
    .select('id,budget_id,requested_amount,reason,status,requested_by,reviewed_by,review_note,created_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }))
}

export function requestFinanceBudgetAmendment(budgetId: string, amount: number, reason: string) {
  return rpc<string>('request_finance_budget_amendment', { p_budget_id: budgetId, p_amount: amount, p_reason: reason })
}

export function reviewFinanceBudgetAmendment(amendmentId: string, approve: boolean, note: string) {
  return rpc<void>('review_finance_budget_amendment', { p_amendment_id: amendmentId, p_approve: approve, p_note: note || null })
}

export function listFinancialTransactions(tenantId: string) {
  return rows<FinancialTransactionRow>(client().from('financial_transactions')
    .select('id,budget_id,transaction_type,category,description,amount,transaction_date,status,submitted_by,reviewed_by,review_note,created_at,void_reason,voided_at,budget:finance_budgets(name,fiscal_year)')
    .eq('barangay_id', tenantId).order('transaction_date', { ascending: false }))
}

export function listFinancialAdjustments(tenantId: string) {
  return rows<FinancialAdjustmentRow>(client().from('financial_adjustments')
    .select('id,transaction_id,amount_change,reason,status,requested_by,reviewed_by,review_note,created_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }))
}

export function requestFinancialAdjustment(transactionId: string, amountChange: number, reason: string) {
  return rpc<string>('request_financial_adjustment', { p_transaction_id: transactionId, p_amount_change: amountChange, p_reason: reason })
}

export function reviewFinancialAdjustment(adjustmentId: string, approve: boolean, note: string) {
  return rpc<void>('review_financial_adjustment', { p_adjustment_id: adjustmentId, p_approve: approve, p_note: note || null })
}

export function createFinanceBudget(tenantId: string, fiscalYear: number, name: string, amount: number) {
  return rpc<string>('create_finance_budget', { p_barangay_id: tenantId, p_fiscal_year: fiscalYear, p_name: name, p_amount: amount })
}

export function approveFinanceBudget(budgetId: string) {
  return rpc<void>('approve_finance_budget', { p_budget_id: budgetId })
}

export function createFinancialTransaction(input: {
  budgetId: string; type: 'income' | 'expense'; category: string; description: string; amount: number; date: string
}) {
  return rpc<string>('create_financial_transaction', {
    p_budget_id: input.budgetId, p_type: input.type, p_category: input.category,
    p_description: input.description, p_amount: input.amount, p_date: input.date,
  })
}

export function reviewFinancialTransaction(transactionId: string, approve: boolean, note: string) {
  return rpc<void>('review_financial_transaction', { p_transaction_id: transactionId, p_approve: approve, p_note: note || null })
}

export function voidFinancialTransaction(transactionId: string, reason: string) {
  return rpc<void>('void_financial_transaction', { p_transaction_id: transactionId, p_reason: reason })
}

export function listFinancialReceipts(tenantId: string) {
  return rows<FinancialReceiptRow>(client().from('financial_receipts')
    .select('id,transaction_id,file_name,mime_type,file_size,storage_path,created_at')
    .eq('barangay_id', tenantId).order('created_at', { ascending: false }))
}

export function recordFinanceReportExport(tenantId: string, dateFrom: string, dateTo: string, rowCount: number) {
  return rpc<string>('record_finance_report_export', {
    p_barangay_id: tenantId, p_date_from: dateFrom, p_date_to: dateTo, p_row_count: rowCount,
  })
}

export async function uploadFinancialReceipt(transactionId: string, file: File) {
  const safeName = file.name.replaceAll('\\', '_').replaceAll('/', '_')
    .split('').map((character) => character.charCodeAt(0) < 32 ? '_' : character).join('').trim()
  if (!safeName || safeName === '.' || safeName === '..' || safeName.length > 180) throw new Error('The receipt file name is invalid or too long.')
  const receiptId = window.crypto.randomUUID()
  const path = await rpc<string>('create_financial_receipt_upload_intent', {
    p_transaction_id: transactionId, p_receipt_id: receiptId, p_file_name: safeName,
    p_mime_type: file.type, p_file_size: file.size,
  })
  const { error } = await client().storage.from('financial-receipts').upload(path, file, {
    cacheControl: '3600', contentType: file.type, upsert: false,
  })
  if (error) throw new Error(error.message)
  await rpc<string>('register_financial_receipt', { p_receipt_id: receiptId })
}

export async function createFinancialReceiptDownloadUrl(path: string) {
  const { data, error } = await client().storage.from('financial-receipts').createSignedUrl(path, 60)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function onboardBarangay(input: {
  name: string; municipality: string; province: string; code: string; captainEmail: string
}) {
  const result = await rpc<Array<{ created_barangay_id: string; invitation_token: string }>>(
    'create_barangay_onboarding', {
      p_name: input.name, p_municipality: input.municipality, p_province: input.province,
      p_code: input.code, p_captain_email: input.captainEmail,
    },
  )
  if (!result?.[0]) throw new Error('Barangay onboarding could not be completed.')
  return result[0]
}

export function listArchiveFolders(tenantId: string) {
  return rows<ArchiveFolderRow>(client().from('archive_folders')
    .select('id,parent_id,name').eq('barangay_id', tenantId).order('name'))
}

export function searchArchiveDocuments(tenantId: string, query: string, folderId: string) {
  return rpc<ArchiveDocumentRow[]>('search_archive_documents', {
    p_barangay_id: tenantId, p_query: query || null, p_folder_id: folderId || null,
  }).then((result) => result ?? [])
}

export function createArchiveFolder(tenantId: string, name: string, parentId: string | null) {
  return rpc<string>('create_archive_folder', { p_barangay_id: tenantId, p_name: name, p_parent_id: parentId })
}

export function createArchiveUploadIntent(input: {
  tenantId: string; documentId: string; folderId: string; fileName: string; description: string
  category: string; mimeType: string; fileSize: number
}) {
  return rpc<string>('create_archive_upload_intent', {
    p_barangay_id: input.tenantId, p_document_id: input.documentId, p_folder_id: input.folderId || null,
    p_file_name: input.fileName, p_description: input.description, p_category: input.category,
    p_mime_type: input.mimeType, p_file_size: input.fileSize,
  })
}

export function registerArchiveDocument(documentId: string) {
  return rpc<string>('register_archive_document', { p_document_id: documentId })
}

export function saveArchiveText(documentId: string, text: string, reviewed: boolean) {
  return rpc<void>('save_archive_text', { p_document_id: documentId, p_text: text, p_reviewed: reviewed })
}

