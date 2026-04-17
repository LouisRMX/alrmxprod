import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side only. Uses the service role key which bypasses RLS.
 * Only use for admin checks that must not be blocked by RLS policies,
 * and for token-validated field capture writes where the token itself
 * is the authorisation boundary.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Returns true if the given user ID has role 'system_admin' in profiles.
 * Uses service role key to bypass RLS — safe because this runs server-side only.
 */
export async function isSystemAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return data?.role === 'system_admin'
}
