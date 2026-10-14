import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App.tsx'
import './index.css'
import { ToastProvider } from './shared/components/ui.tsx'
import { StoreProvider } from './features/portal/store/store.tsx'
import { ClinicProvider } from './features/clinic/store/store.tsx'
import { registerServiceWorker } from './shared/lib/pwa.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <ClinicProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ClinicProvider>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
)

registerServiceWorker()
