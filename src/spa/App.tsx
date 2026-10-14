import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Button } from '../shared/components/ui'
import Landing from '../features/landing/Landing'
const AuthPage = lazy(() => import('../features/auth/AuthPage'))
// Himsog clinic: front desk, doctor, waiting screen and print views.
const ClinicShell = lazy(() => import('../features/clinic/ClinicShell').then((m) => ({ default: m.ClinicShell })))
const ClinicHome = lazy(() => import('../features/clinic/ClinicShell').then((m) => ({ default: m.ClinicHome })))
const DoctorOnly = lazy(() => import('../features/clinic/ClinicShell').then((m) => ({ default: m.DoctorOnly })))
const ClinicLogin = lazy(() => import('../features/clinic/pages/ClinicLogin'))
const CheckIn = lazy(() => import('../features/clinic/pages/CheckIn'))
const QueueBoard = lazy(() => import('../features/clinic/pages/QueueBoard'))
const Patients = lazy(() => import('../features/clinic/pages/Patients'))
const PatientRecord = lazy(() => import('../features/clinic/pages/PatientRecord'))
const DoctorQueue = lazy(() => import('../features/clinic/pages/DoctorQueue'))
const Consult = lazy(() => import('../features/clinic/pages/Consult'))
const Documents = lazy(() => import('../features/clinic/pages/Documents'))
const DailyReport = lazy(() => import('../features/clinic/pages/DailyReport'))
const AuditTrail = lazy(() => import('../features/clinic/pages/AuditTrail'))
const Settings = lazy(() => import('../features/clinic/pages/Settings'))
const WaitingScreen = lazy(() => import('../features/clinic/pages/WaitingScreen'))
const PrintPage = lazy(() => import('../features/clinic/pages/PrintPage'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function RouteFallback() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-canvas" aria-busy="true" aria-label="Loading">
      <span className="relative inline-grid size-10 place-items-center rounded-[12px] bg-brand-600 shadow-brand">
        <span className="absolute inset-0 animate-pulse-ring rounded-[12px] bg-brand-400" />
        <span className="absolute h-[52%] w-[16%] rounded-full bg-white" />
        <span className="absolute h-[16%] w-[52%] rounded-full bg-white" />
      </span>
    </div>
  )
}

function NotFound() {
  return (
    <div className="grid min-h-[100dvh] place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-brand-600">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">This page is not in the record</h1>
        <p className="mt-2 text-muted">The link may be old or mistyped.</p>
        <Button to="/" className="mt-6">Back to home</Button>
      </div>
    </div>
  )
}

const doctor = (el: React.ReactNode) => <DoctorOnly>{el}</DoctorOnly>

/** Fetch every clinic screen once the app is idle, so the service worker has them for a cold start with the server down. */
function usePreloadClinicScreens() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    const run = () => {
      void import('../features/clinic/ClinicShell')
      void import('../features/clinic/pages/ClinicLogin')
      void import('../features/clinic/pages/CheckIn')
      void import('../features/clinic/pages/QueueBoard')
      void import('../features/clinic/pages/Patients')
      void import('../features/clinic/pages/PatientRecord')
      void import('../features/clinic/pages/DoctorQueue')
      void import('../features/clinic/pages/Consult')
      void import('../features/clinic/pages/Documents')
      void import('../features/clinic/pages/DailyReport')
      void import('../features/clinic/pages/AuditTrail')
      void import('../features/clinic/pages/Settings')
      void import('../features/clinic/pages/WaitingScreen')
      void import('../features/clinic/pages/PrintPage')
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(run)
    else setTimeout(run, 2000)
  }, [])
}

export default function App() {
  usePreloadClinicScreens()
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/clinic/login" element={<ClinicLogin />} />
        <Route path="/clinic" element={<ClinicShell />}>
          <Route index element={<ClinicHome />} />
          <Route path="checkin" element={<CheckIn />} />
          <Route path="queue" element={<QueueBoard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/:id" element={<PatientRecord />} />
          <Route path="doctor" element={doctor(<DoctorQueue />)} />
          <Route path="consult/:patientId" element={doctor(<Consult />)} />
          <Route path="documents" element={doctor(<Documents />)} />
          <Route path="report" element={doctor(<DailyReport />)} />
          <Route path="audit" element={doctor(<AuditTrail />)} />
          <Route path="settings" element={doctor(<Settings />)} />
        </Route>
        <Route path="/waiting" element={<WaitingScreen />} />
        <Route path="/print/:kind/:id" element={<PrintPage />} />
        {/* Old front desk and doctor portals were replaced by the clinic workflow. */}
        <Route path="/staff/*" element={<Navigate to="/clinic" replace />} />
        <Route path="/doctor/*" element={<Navigate to="/clinic" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  )
}
