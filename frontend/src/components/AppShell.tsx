import {
  Bell,
  CalendarDots,
  ChartLineUp,
  ChatCircleDots,
  CheckSquareOffset,
  FolderOpen,
  House,
  List,
  MagnifyingGlass,
  Receipt,
  ShieldCheck,
  SignOut,
  Stethoscope,
  UserCircle,
  UsersThree,
  X,
  ArrowsLeftRight,
  CaretDown,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { STAFF } from '../data/seed'
import type { Role } from '../data/types'
import { cn } from '../lib/utils'
import { useStore } from '../store/store'
import { useClinic } from '../clinic/store'
import { Logo } from './Logo'
import { Avatar, Badge, IconButton } from './ui'

type NavItem = { to: string; label: string; icon: Icon; end?: boolean; badge?: number }

function useNav(role: Role): { main: NavItem[]; secondary?: NavItem[] } {
  const { appointments, messages, tasks, session } = useStore()
  return useMemo(() => {
    if (role === 'patient') {
      const unread = messages.filter((m) => m.patientId === session?.userId && m.from === 'care-team').length
      return {
        main: [
          { to: '/patient', label: 'Home', icon: House, end: true },
          { to: '/patient/records', label: 'Health record', icon: FolderOpen },
          { to: '/patient/appointments', label: 'Appointments', icon: CalendarDots },
          { to: '/patient/messages', label: 'Messages', icon: ChatCircleDots, badge: unread ? Math.min(unread, 9) : undefined },
          { to: '/patient/profile', label: 'Profile', icon: UserCircle },
        ],
      }
    }
    if (role === 'secretary') {
      const requests = appointments.filter((a) => a.status === 'requested').length
      const open = tasks.filter((t) => !t.done).length
      return {
        main: [
          { to: '/staff', label: 'Overview', icon: House, end: true },
          { to: '/staff/patients', label: 'Patient inventory', icon: UsersThree },
          { to: '/staff/schedule', label: 'Schedule', icon: CalendarDots, badge: requests || undefined },
          { to: '/staff/billing', label: 'Billing & claims', icon: Receipt },
          { to: '/staff/tasks', label: 'Tasks', icon: CheckSquareOffset, badge: open || undefined },
        ],
        secondary: [
          { to: '/staff/reports', label: 'Reports', icon: ChartLineUp },
          { to: '/staff/security', label: 'Security & audit', icon: ShieldCheck },
        ],
      }
    }
    return {
      main: [{ to: '/doctor', label: 'Consultations', icon: Stethoscope }],
    }
  }, [role, appointments, messages, tasks, session])
}

function NavItems({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-600 text-white shadow-brand' : 'text-ink-2 hover:bg-mist hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} weight={isActive ? 'fill' : 'regular'} />
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && (
                  <span className={cn('grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular', isActive ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700')}>
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

const roleLabel: Record<Role, string> = { patient: 'Patient portal', secretary: 'Front desk', doctor: 'Doctor workspace' }

function SidebarBody({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const nav = useNav(role)
  const { actorName, signOut, session, patients, doctors } = useStore()
  const navigate = useNavigate()
  const photo =
    role === 'doctor'
      ? doctors.find((d) => d.id === session?.userId)?.photo
      : role === 'secretary'
        ? STAFF.find((s) => s.id === session?.userId)?.photo
        : patients.find((p) => p.id === session?.userId)?.photo
  const subtitle =
    role === 'doctor'
      ? doctors.find((d) => d.id === session?.userId)?.specialty
      : role === 'secretary'
        ? STAFF[0].title
        : session?.userId

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center px-5">
        <Logo to={role === 'patient' ? '/patient' : role === 'secretary' ? '/staff' : '/doctor'} />
      </div>
      <div className="px-4 pb-2">
        <p className="px-3.5 pb-2 text-xs font-medium text-faint">{roleLabel[role]}</p>
        <NavItems items={nav.main} onNavigate={onNavigate} />
      </div>
      {nav.secondary && (
        <div className="mt-4 px-4">
          <p className="px-3.5 pb-2 text-xs font-medium text-faint">Insights & compliance</p>
          <NavItems items={nav.secondary} onNavigate={onNavigate} />
        </div>
      )}
      <div className="mt-auto p-4">
        <div className="rounded-3xl border border-line bg-canvas p-3">
          <div className="flex items-center gap-3">
            <Avatar name={actorName} src={photo} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{actorName}</p>
              <p className="truncate text-xs text-muted">{subtitle}</p>
            </div>
            <IconButton
              label="Sign out"
              className="size-8"
              onClick={() => {
                signOut()
                navigate('/auth')
              }}
            >
              <SignOut size={16} />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Demo helper: hop between the three portals without re-typing credentials. */
function RoleSwitcher() {
  const { session, signIn, resetDemo } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const clinic = useClinic()
  // Front desk and doctor live in the Himsog clinic app; the patient portal is the extra.
  const options: { role: Role; id: string; label: string; to: string; who: string }[] = [
    { role: 'patient', id: 'RC-10482', label: 'Patient portal (extra)', to: '/patient', who: 'Andrea Villanueva' },
    { role: 'secretary', id: 'st-f1', label: 'Front desk', to: '/clinic/checkin', who: 'Cristina Bañas' },
    { role: 'doctor', id: 'st-d1', label: 'Doctor', to: '/clinic/doctor', who: 'Dr. Ramon Sollesta' },
  ]
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-ink-2 transition hover:border-brand-200 hover:text-brand-700"
        aria-expanded={open}
      >
        <ArrowsLeftRight size={16} />
        <span className="hidden whitespace-nowrap xl:inline">Switch portal</span>
        <CaretDown size={12} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lift"
          >
            <p className="px-3 pb-1 pt-2 text-xs text-faint">Demo accounts</p>
            {options.map((o) => (
              <button
                key={o.role}
                onClick={() => {
                  if (o.role === 'patient') signIn(o.role, o.id)
                  else clinic.signIn(o.id)
                  setOpen(false)
                  navigate(o.to)
                }}
                className={cn('flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition hover:bg-mist', session?.role === o.role && 'bg-brand-50')}
              >
                <span className="text-sm font-medium text-ink">{o.label}</span>
                <span className="text-xs text-muted">{o.who}</span>
              </button>
            ))}
            <div className="mt-1 border-t border-line pt-1">
              <button
                onClick={() => {
                  resetDemo()
                  setOpen(false)
                  navigate('/')
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-muted transition hover:bg-mist hover:text-ink"
              >
                <ArrowCounterClockwise size={16} /> Reset demo data
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function GlobalSearch() {
  const { patients } = useStore()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const results = q.trim()
    ? patients.filter((p) => `${p.name} ${p.id} ${p.conditions.join(' ')}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : []
  return (
    <div className="relative hidden w-full max-w-md md:block">
      <MagnifyingGlass size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        placeholder="Search patients, MRN or condition"
        aria-label="Search patients"
        className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-16 text-sm text-ink placeholder:text-faint focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-line bg-canvas px-2 py-0.5 font-sans text-[11px] text-muted">⌘K</kbd>
      {focus && results.length > 0 && (
        <div className="absolute left-0 right-0 top-13 z-40 rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
          {results.map((p) => (
            <button
              key={p.id}
              onMouseDown={() => {
                navigate(`/staff/patients/${p.id}`)
                setQ('')
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-mist"
            >
              <Avatar name={p.name} src={p.photo} size="xs" />
              <span className="flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
              <span className="text-xs tabular text-muted">{p.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MobileTabBar({ role }: { role: Role }) {
  const nav = useNav(role)
  if (role !== 'patient') return null
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {nav.main.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={({ isActive }) => cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <item.icon size={22} weight={isActive ? 'fill' : 'regular'} />
                  {item.label === 'Health record' ? 'Records' : item.label}
                  {item.badge !== undefined && <span className="absolute right-[22%] top-1.5 size-2 rounded-full bg-brand-600" />}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function AppShell({ role }: { role: Role }) {
  const { session } = useStore()
  const [drawer, setDrawer] = useState(false)
  if (!session) return <Navigate to="/auth" replace />
  if (session.role !== role) {
    const home = session.role === 'patient' ? '/patient' : session.role === 'secretary' ? '/staff' : '/doctor'
    return <Navigate to={home} replace />
  }

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-line bg-surface lg:block">
        <SidebarBody role={role} />
      </aside>

      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-brand-950/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="absolute inset-y-0 left-0 w-[284px] bg-surface shadow-lift"
            >
              <IconButton label="Close menu" onClick={() => setDrawer(false)} className="absolute right-4 top-4 size-9">
                <X size={16} />
              </IconButton>
              <SidebarBody role={role} onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-[264px]">
        <header className="glass sticky top-0 z-20 border-b border-line/70">
          <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <IconButton label="Open menu" onClick={() => setDrawer(true)} className="lg:hidden">
              <List size={18} />
            </IconButton>
            <div className="lg:hidden">
              <Logo to={role === 'patient' ? '/patient' : role === 'secretary' ? '/staff' : '/doctor'} />
            </div>
            {role === 'secretary' ? <GlobalSearch /> : <TopbarContext role={role} />}
            <div className="ml-auto flex items-center gap-2">
              <RoleSwitcher />
              <IconButton label="Notifications" className="relative hidden sm:inline-flex">
                <Bell size={18} />
                <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-brand-600 ring-2 ring-white" />
              </IconButton>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <Outlet />
        </main>
      </div>
      <MobileTabBar role={role} />
    </div>
  )
}

function TopbarContext({ role }: { role: Role }): ReactNode {
  return (
    <div className="hidden items-center gap-2 md:flex">
      <Badge tone="brand" icon={<ShieldCheck size={12} weight="fill" />}>
        {role === 'doctor' ? 'Clinician access' : 'Your data is encrypted'}
      </Badge>
    </div>
  )
}
