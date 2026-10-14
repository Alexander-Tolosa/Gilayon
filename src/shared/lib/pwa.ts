/*
  Progressive Web App install support. The concept installs Himsog on clinic computers,
  tablets and phones from the browser, with no app store. Chrome and Edge fire
  beforeinstallprompt; Safari (iPhone/iPad) installs from Share > Add to Home Screen.
*/

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
  })
}

export const isInstalled = () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  return outcome
}

export function installHelp(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'In Safari, tap Share, then Add to Home Screen.'
  if (/Android/.test(ua)) return 'In Chrome, open the menu (⋮) and choose Install app.'
  return 'In Chrome or Edge, click the install icon at the right of the address bar, or open the menu and choose Install Himsog.'
}

/** Register the service worker in production builds so the app opens with the network down. */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline caching unavailable: the app still works online */
    })
  }
  // The app mounts after the page's load event, so waiting for "load" would never fire.
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
