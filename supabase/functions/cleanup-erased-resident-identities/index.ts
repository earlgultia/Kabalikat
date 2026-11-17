import { createClient } from 'npm:@supabase/supabase-js@2'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function matchesSecret(candidate: string, expected: string) {
  if (candidate.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const expectedSecret = Deno.env.get('ERASURE_CLEANUP_SECRET')
  const suppliedSecret = request.headers.get('x-erasure-cleanup-secret') ?? ''
  if (!expectedSecret || !matchesSecret(suppliedSecret, expectedSecret)) {
    return json({ error: 'Not authorized.' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')
  if (!url || !serviceKey) return json({ error: 'Cleanup service is not configured.' }, 500)

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: staleUploadsQueued, error: staleUploadError } = await admin.rpc('queue_stale_resident_identity_uploads')
  if (staleUploadError) return json({ error: 'Could not queue abandoned identity uploads.' }, 500)

  const { data: claimedRows, error: claimError } = await admin.rpc('claim_resident_identity_file_erasure', {
    p_limit: 100,
  })
  if (claimError) return json({ error: 'Could not claim identity file cleanup work.' }, 500)

  const rows = (claimedRows ?? []) as Array<{
    cleanup_id: string
    bucket_id: string
    object_path: string
    claim_token: string
  }>
  if (!rows.length) return json({ staleUploadsQueued: staleUploadsQueued ?? 0, processed: 0, failed: 0 })

  const buckets = new Map<string, typeof rows>()
  for (const row of rows) buckets.set(row.bucket_id, [...(buckets.get(row.bucket_id) ?? []), row])
  let processed = 0
  let failed = 0

  for (const [bucketId, bucketRows] of buckets) {
    const { error: removeError } = await admin.storage.from(bucketId).remove(bucketRows.map((row) => row.object_path))
    const claimToken = bucketRows[0]?.claim_token
    if (!claimToken) { failed += bucketRows.length; continue }

    const { error: finishError } = await admin.rpc('finish_resident_identity_file_erasure', {
      p_cleanup_ids: bucketRows.map((row) => row.cleanup_id),
      p_claim_token: claimToken,
      p_error: removeError?.message ?? null,
    })
    if (finishError || removeError) failed += bucketRows.length
    else processed += bucketRows.length
  }

  return json({ staleUploadsQueued: staleUploadsQueued ?? 0, processed, failed })
})
