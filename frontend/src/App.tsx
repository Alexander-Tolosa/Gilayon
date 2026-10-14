import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Button } from './components/ui'
import Landing from './pages/Landing'
const AuthPage = lazy(() => import('./pages/auth/AuthPage'))
// Patient portal: kept as an extra. The concept's demo has no patient login.
const PatientHome = lazy(() => import('./pages/patient/PatientHome'))
const PatientRecords = lazy(() => import('./pages/patient/PatientRecords'))
const PatientAppointments = lazy(() => import('./pages/patient/PatientAppointments'))
const PatientMessages = lazy(() => import('./pages/patient/PatientMessages'))
const PatientProfile = lazy(() => import('./pages/patient/PatientProfile'))
const TelehealthRoom = lazy(() => import('./pages/patient/TelehealthRoom'))
// Himsog clinic: front desk, doctor, waiting screen and print views.
const ClinicShell = lazy(() => import('./clinic/ClinicShell').then((m) => ({ default: m.ClinicShell })))
const ClinicHome = lazy(() => import('./clinic/ClinicShell').then((m) => ({ default: m.ClinicHome })))
const DoctorOnly = lazy(() => import('./clinic/ClinicShell').then((m) => ({ default: m.DoctorOnly })))
const ClinicLogin = lazy(() => import('./clinic/pages/ClinicLogin'))
const CheckIn = lazy(() => import('./clinic/pages/CheckIn'))
const QueueBoard = lazy(() => import('./clinic/pages/QueueBoard'))
const Patients = lazy(() => import('./clinic/pages/Patients'))
const PatientRecord = lazy(() => import('./clinic/pages/PatientRecord'))
const EmployeeImport = lazy(() => import('./clinic/pages/EmployeeImport'))
const DoctorQueue = lazy(() => import('./clinic/pages/DoctorQueue'))
const Consult = lazy(() => import('./clinic/pages/Consult'))
const Documents = lazy(() => import('./clinic/pages/Documents'))
const DailyReport = lazy(() => import('./clinic/pages/DailyReport'))
const AuditTrail = lazy(() => import('./clinic/pages/AuditTrail'))
const Settings = lazy(() => import('./clinic/pages/Settings'))
const WaitingScreen = lazy(() => import('./clinic/pages/WaitingScreen'))
const PrintPage = lazy(() => import('./clinic/pages/PrintPage'))

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

export default function App() {
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
          <Route path="import" element={<EmployeeImport />} />
          <Route path="doctor" element={doctor(<DoctorQueue />)} />
          <Route path="consult/:patientId" element={doctor(<Consult />)} />
          <Route path="documents" element={doctor(<Documents />)} />
          <Route path="report" element={doctor(<DailyReport />)} />
          <Route path="audit" element={doctor(<AuditTrail />)} />
          <Route path="settings" element={doctor(<Settings />)} />
        </Route>
        <Route path="/waiting" element={<WaitingScreen />} />
        <Route path="/print/:kind/:id" element={<PrintPage />} />
        <Route path="/patient" element={<AppShell role="patient" />}>
          <Route index element={<PatientHome />} />
          <Route path="records" element={<PatientRecords />} />
          <Route path="appointments" element={<PatientAppointments />} />
          <Route path="messages" element={<PatientMessages />} />
          <Route path="profile" element={<PatientProfile />} />
          <Route path="visit/:id" element={<TelehealthRoom />} />
        </Route>
        {/* Old front desk and doctor portals were replaced by the clinic workflow. */}
        <Route path="/staff/*" element={<Navigate to="/clinic" replace />} />
        <Route path="/doctor/*" element={<Navigate to="/clinic" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  )
}
