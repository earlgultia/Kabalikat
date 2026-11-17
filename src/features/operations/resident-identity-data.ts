import { supabase } from '../../lib/supabase'

export type ResidentIdentitySubmission = {
  id: string
  barangay_id: string
  resident_id: string
  front_storage_path: string
  back_storage_path: string
  status: 'uploading' | 'pending' | 'verified' | 'rejected'
  review_note: string | null
  created_at: string
  resident?: { first_name: string; last_name: string } | null
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listMyResidentIdentitySubmissions(residentId: string) {
  const { data, error } = await client().from('resident_identity_submissions')
    .select('id,barangay_id,resident_id,front_storage_path,back_storage_path,status,review_note,created_at')
    .eq('resident_id', residentId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  return (data ?? []) as ResidentIdentitySubmission[]
}

export async function listPendingResidentIdentitySubmissions(barangayId: string, page = 0) {
  const pageSize = 50
  const start = Math.max(0, page) * pageSize
  const { data, error } = await client().from('resident_identity_submissions')
    .select('id,barangay_id,resident_id,front_storage_path,back_storage_path,status,review_note,created_at,resident:residents(first_name,last_name)')
    .eq('barangay_id', barangayId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(start, start + pageSize)
  if (error) throw new Error(error.message)
  type QueryRow = Omit<ResidentIdentitySubmission, 'resident'> & {
    resident: NonNullable<ResidentIdentitySubmission['resident']> | NonNullable<ResidentIdentitySubmission['resident']>[] | null
  }
  const rows = (data ?? []) as unknown as QueryRow[]
  return {
    items: rows.slice(0, pageSize).map((row): ResidentIdentitySubmission => ({
      ...row,
      resident: Array.isArray(row.resident) ? row.resident[0] ?? null : row.resident,
    })),
    hasNextPage: rows.length > pageSize,
  }
}

export async function submitResidentIdentityDocuments(input: {
  barangayId: string
  residentId: string
  front: File
  back: File
}) {
  const acceptedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])
  const maxBytes = 10 * 1024 * 1024
  for (const file of [input.front, input.back]) {
    if (!acceptedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) {
      throw new Error('Choose a PDF, JPEG, or PNG under 10 MB for each side of the ID.')
    }
  }
  const extension = (file: File) => {
    if (file.type === 'application/pdf') return 'pdf'
    if (file.type === 'image/png') return 'png'
    return 'jpg'
  }
  const { data, error } = await client().rpc('start_resident_identity_upload', {
    p_barangay_id: input.barangayId,
    p_resident_id: input.residentId,
    p_front_extension: extension(input.front),
    p_back_extension: extension(input.back),
  })
  if (error) throw new Error(error.message)
  const upload = Array.isArray(data) ? data[0] : data
  if (!upload?.submission_id || !upload?.front_storage_path || !upload?.back_storage_path) {
    throw new Error('The secure upload could not be started. Refresh and try again.')
  }

  const storage = client().storage.from('resident-identity-documents')
  for (const [path, file] of [[upload.front_storage_path, input.front], [upload.back_storage_path, input.back]] as const) {
    const { error: uploadError } = await storage.upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) throw new Error(uploadError.message)
  }

  const { error: completeError } = await client().rpc('complete_resident_identity_upload', {
    p_submission_id: upload.submission_id,
  })
  if (completeError) {
    // The database may have committed while the response was lost. Confirm
    // this exact submission before telling the resident the upload failed.
    let completed = false
    try {
      const ownSubmissions = await listMyResidentIdentitySubmissions(input.residentId)
      completed = ownSubmissions.some((submission) =>
        submission.id === upload.submission_id && submission.status === 'pending',
      )
    } catch {
      completed = false
    }
    if (!completed) throw new Error(completeError.message)
  }
}

export async function createResidentIdentitySignedUrl(path: string) {
  const { data, error } = await client().storage.from('resident-identity-documents').createSignedUrl(path, 60)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function reviewResidentIdentity(submissionId: string, decision: 'verified' | 'rejected', note = '') {
  const { error } = await client().rpc('review_resident_identity_submission', {
    p_submission_id: submissionId,
    p_decision: decision,
    p_review_note: note,
  })
  if (error) throw new Error(error.message)
}
