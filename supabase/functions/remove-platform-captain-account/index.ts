import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')
  if (!authorization || !url || !publicKey || !secretKey) {
    return json({ error: 'Account removal is not configured on the server.' }, 500)
  }

  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userResult, error: userError } = await caller.auth.getUser()
  if (userError || !userResult.user) return json({ error: 'Sign in again before removing an account.' }, 401)

  let body: { user_id?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400)
  }
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: 'A valid Captain account is required.' }, 400)
  }
  if (reason.length < 3 || reason.length > 1000) return json({ error: 'Enter a reason between 3 and 1000 characters.' }, 400)

  const { error: prepareError } = await caller.rpc('prepare_platform_captain_account_removal', {
    p_user_id: userId,
    p_reason: reason,
  })
  if (prepareError) return json({ error: prepareError.message }, 403)

  const { data: targetResult, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if (lookupError && lookupError.status !== 404) {
    return json({ error: 'Access was suspended, but the Auth account status could not be checked. Retry this action.' }, 500)
  }
  if (!targetResult.user) {
    // A prior request may have removed the Auth identity but failed before it
    // could mark the audit row complete. Finish that step safely on retry.
    const { error: completeError } = await admin.rpc('complete_platform_captain_account_removal', { p_user_id: userId })
    if (completeError) return json({ error: 'Access was suspended, but account removal could not be verified. Retry from the Captain accounts list.' }, 500)
    return json({ success: true, alreadyRemoved: true })
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, true)
  if (deleteError) {
    return json({ error: 'All barangay memberships were suspended, but Auth account removal did not finish. Retry this action to complete it.' }, 500)
  }

  const { error: completeError } = await admin.rpc('complete_platform_captain_account_removal', { p_user_id: userId })
  if (completeError) {
    return json({ error: 'The Auth account was removed and access was suspended, but the audit record needs a retry.' }, 500)
  }
  return json({ success: true })
})
