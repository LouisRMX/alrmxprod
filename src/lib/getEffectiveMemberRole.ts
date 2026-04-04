import { cookies } from 'next/headers'

export type MemberRole = 'owner' | 'manager' | 'operator'

export interface EffectiveMemberRole {
  role: MemberRole | null
  isOverridden: boolean
}

/**
 * Returns the effective member role for the current request.
 *
 * For system_admin users, checks the `viewAs` cookie and overrides the real
 * role when set. This lets admins preview the app from any role perspective
 * without logging out.
 *
 * For non-admin users, returns the real role as-is.
 */
export async function getEffectiveMemberRole(
  realRole: MemberRole | null,
  isAdmin: boolean,
): Promise<EffectiveMemberRole> {
  if (!isAdmin) {
    return { role: realRole, isOverridden: false }
  }

  const cookieStore = await cookies()
  const viewAs = cookieStore.get('viewAs')?.value as MemberRole | undefined

  if (viewAs && ['owner', 'manager', 'operator'].includes(viewAs)) {
    return { role: viewAs, isOverridden: true }
  }

  return { role: realRole, isOverridden: false }
}
