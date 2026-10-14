/** Runs once when the server starts. Starts the nightly backup schedule (Node runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBackupScheduler } = await import('./src/server/backup/scheduler')
    startBackupScheduler()
  }
}
