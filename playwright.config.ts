import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/*
  Browser end-to-end tests: npm run test:e2e

  Builds the app and serves it with `next start` on its own port and a fresh embedded database in a
  temporary folder, so the tests never touch a dev server or real records. Workers inherit the folder
  through E2E_DATA_DIR, so the config makes it only once.
*/
const PORT = 3100
process.env.E2E_DATA_DIR ??= mkdtempSync(path.join(tmpdir(), 'gilayon-e2e-'))

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One browser at a time: the tests share one clinic database, like the real clinic PCs do.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // The service worker caches screens for offline use; tests check the app itself, not the cache.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/public/queue`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { PGLITE_DIR: process.env.E2E_DATA_DIR, IDLE_MINUTES: '0', OLLAMA_VISION_AUTO: '0', GILAYON_AUTO_SEED: '1' },
  },
})
