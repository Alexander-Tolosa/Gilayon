import { Navigate, useSearchParams } from 'react-router-dom'
import { lastLogin } from '../clinic/pages/ClinicLogin'
import type { StaffRole } from '../clinic/types'

const ROLE_ALIASES: Record<string, StaffRole> = {
  doctor: 'doctor',
  nurse: 'nurse',
  desk: 'desk',
  secretary: 'desk',
  receptionist: 'desk',
}

/**
 * Clinic staff sign in to the Gilayon clinic app. There is no separate public
 * sign-up: "Get started" and "Sign in" both land here, then on the clinic
 * login screen. "Sign in" additionally resumes the last account used on this
 * device, so a returning staff member skips straight to typing a password.
 */
export default function AuthPage() {
  const [params] = useSearchParams()
  const roleParam = params.get('role')
  const explicitRole = roleParam ? ROLE_ALIASES[roleParam] : undefined
  const remembered = params.get('mode') === 'signin' ? lastLogin() : null
  const role = explicitRole ?? remembered?.role

  const qs = new URLSearchParams()
  if (role) qs.set('role', role)
  if (remembered && role === remembered.role) qs.set('account', remembered.staffId)
  const query = qs.toString()

  return <Navigate to={`/clinic/login${query ? `?${query}` : ''}`} replace />
}
