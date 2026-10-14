import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { ToastProvider } from './components/ui.tsx'
import { StoreProvider } from './store/store.tsx'
import { ClinicProvider } from './clinic/store.tsx'
import { registerServiceWorker } from './lib/pwa.ts'

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
