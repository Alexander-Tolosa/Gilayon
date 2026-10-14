import {
  ChartBar,
  ClipboardText,
  FileText,
  Gear,
  List as ListIcon,
  Monitor,
  SignOut,
  Stethoscope,
  UserCirclePlus,
  UsersThree,
  X,
  Queue as QueueIcon,
  AddressBook,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import { Avatar } from '../components/ui'
import { cn } from '../lib/utils'
import { LanguageSwitch, StatusBadge } from './components'
import { useT } from './i18n'
import { todayKey } from './lib'
import { useClinic } from './store'
import type { StaffRole } from './types'

type Item = { to: string; label: string; icon: Icon; badge?: number }

/** Clinic screens use larger text for senior doctors and staff (concept: large text, big buttons). */
export function useClinicScale() {
  useEffect(() => {
    document.documentElement.dataset.ui = 'clinic'
    return () => {
      delete document.documentElement.dataset.ui
    }
  }, [])
}

function useNav(role: StaffRole): Item[] {
  const { data } = useClinic()
  const waiting = data.tickets.filter((t) => t.status === 'waiting' && t.day === todayKey()).length
  if (role === 'desk')
    return [
      { to: '/clinic/checkin', label: 'Check in', icon: UserCirclePlus },
      { to: '/clinic/queue', label: 'Queue board', icon: QueueIcon, badge: waiting || undefined },
      { to: '/clinic/patients', label: 'Patients', icon: UsersThree },
      { to: '/clinic/import', label: 'Employee list', icon: AddressBook },
    ]
  return [
    { to: '/clinic/doctor', label: 'My queue', icon: Stethoscope, badge: waiting || undefined },
    { to: '/clinic/patients', label: 'Patients', icon: UsersThree },
    { to: '/clinic/documents', label: 'Documents', icon: FileText },
    { to: '/clinic/report', label: 'Daily report', icon: ChartBar },
    { to: '/clinic/audit', label: 'Audit trail', icon: ClipboardText },
    { to: '/clinic/queue', label: 'Queue board', icon: QueueIcon },
    { to: '/clinic/settings', label: 'Settings', icon: Gear },
  ]
}

function Sidebar({ role, onNavigate }: { role: StaffRole; onNavigate?: () => void }) {
  const t = useT()
  const nav = useNav(role)
  const { me, signOut } = useClinic()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-20 items-center gap-3 px-5">
        <LogoMark className="size-10 rounded-xl" />
        <div className="leading-tight">
          <p className="text-xl font-semibold tracking-[-0.02em]">himsog</p>
          <p className="text-[13px] text-muted">HMO-Clinic records</p>
        </div>
      </div>
      <p className="px-6 pb-2 text-sm font-semibold text-faint">{role === 'desk' ? t('Front desk') : t('Doctor')}</p>
      <nav className="flex flex-col gap-1.5 px-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => cn('flex h-14 items-center gap-3.5 rounded-2xl px-4 text-[17px] font-medium transition', isActive ? 'bg-brand-600 text-white shadow-brand' : 'text-ink hover:bg-mist')}
          >
            {({ isActive }) => (
              <>
                <item.icon size={24} weight={isActive ? 'fill' : 'regular'} />
                <span className="flex-1">{t(item.label)}</span>
                {item.badge !== undefined && <span className={cn('grid min-w-7 place-items-center rounded-full px-2 text-sm font-bold tabular', isActive ? 'bg-white/20' : 'bg-brand-50 text-brand-800')}>{item.badge}</span>}
              </>
            )}
          </NavLink>
        ))}
        <a href="/waiting" target="_blank" rel="noreferrer" className="flex h-14 items-center gap-3.5 rounded-2xl px-4 text-[17px] font-medium text-ink transition hover:bg-mist">
          <Monitor size={24} />
          <span className="flex-1">{t('Waiting screen')}</span>
        </a>
      </nav>
      <div className="mt-auto p-3">
        <div className="flex items-center gap-3 rounded-3xl border border-line bg-canvas p-3">
          <Avatar name={me?.name ?? ''} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{me?.name}</p>
            <p className="truncate text-[13px] text-muted">{me?.title}</p>
          </div>
          <button onClick={signOut} aria-label={t('Sign out')} title={t('Sign out')} className="grid size-11 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:text-danger">
            <SignOut size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function ClinicShell() {
  useClinicScale()
  const { me } = useClinic()
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setDrawer(false)
  }
  if (!me) return <Navigate to="/clinic/login" replace />

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-line bg-surface lg:block">
        <Sidebar role={me.role} />
      </aside>
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-brand-950/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }} className="absolute inset-y-0 left-0 w-[290px] bg-surface shadow-lift">
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-5 grid size-10 place-items-center rounded-full border border-line">
                <X size={18} />
              </button>
              <Sidebar role={me.role} onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
      <div className="lg:pl-[272px]">
        <header className="glass sticky top-0 z-20 border-b border-line/70">
          <div className="mx-auto flex h-20 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setDrawer(true)} aria-label="Open menu" className="grid size-12 place-items-center rounded-full border border-line bg-surface lg:hidden">
              <ListIcon size={22} />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <LanguageSwitch />
              <StatusBadge />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function ClinicHome() {
  const { me } = useClinic()
  if (!me) return <Navigate to="/clinic/login" replace />
  return <Navigate to={me.role === 'desk' ? '/clinic/checkin' : '/clinic/doctor'} replace />
}

/** Doctor-only screens: front desk cannot see consultation notes, documents, reports or the audit trail. */
export function DoctorOnly({ children }: { children: React.ReactNode }) {
  const { me } = useClinic()
  if (me?.role !== 'doctor') return <Navigate to="/clinic" replace />
  return <>{children}</>
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[2.2rem]">{title}</h1>
        {sub && <p className="mt-1 text-base text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
