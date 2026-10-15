import { StrictMode, useEffect, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CLINIC_ERROR_EVENT, ClinicProvider, useClinic } from '../features/clinic/store/store'
import { StoreProvider } from '../features/portal/store/store'
import { LogoMark } from '../shared/components/Logo'
import { ToastProvider, useToast } from '../shared/components/ui'
import { registerServiceWorker } from '../shared/lib/pwa'

/** Shows the store's server errors (rejected PIN change, someone else already called a patient, ...) as toasts. */
function ErrorToasts() {
  const toast = useToast()
  useEffect(() => {
    const on = (e: Event) => toast({ tone: 'warn', title: String((e as CustomEvent).detail ?? 'Something went wrong') })
    window.addEventListener(CLINIC_ERROR_EVENT, on)
    return () => window.removeEventListener(CLINIC_ERROR_EVENT, on)
  }, [toast])
  return null
}

/** Holds the screens back until the first copy of the records has arrived, so deep links don't flash "not found". */
function ReadyGate({ children }: { children: ReactNode }) {
  const { ready } = useClinic()
  if (ready) return <>{children}</>
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-canvas" aria-busy="true" aria-label="Loading">
      <span className="relative inline-grid size-12 place-items-center">
        <span className="absolute inset-[6%] animate-pulse-ring rounded-[22%] bg-brand-400" />
        <LogoMark className="relative size-12" alt="" />
      </span>
    </div>
  )
}

export default function Root() {
  useEffect(() => {
    registerServiceWorker()
  }, [])
  return (
    <StrictMode>
      <BrowserRouter>
        <StoreProvider>
          <ClinicProvider>
            <ToastProvider>
              <ErrorToasts />
              <ReadyGate>
                <App />
              </ReadyGate>
            </ToastProvider>
          </ClinicProvider>
        </StoreProvider>
      </BrowserRouter>
    </StrictMode>
  )
}
