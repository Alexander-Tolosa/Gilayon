/*
  Backup tools for the clinic server PC.

    npm run backup                       back up now (same as the nightly job)
    npm run backup:list                  show the backups in BACKUP_DIR
    npm run backup:verify -- <file>      prove a backup is complete and untampered
    npm run backup:restore -- <file> --yes   replace ALL records with this backup (stop the server first)

  Settings come from the environment, see .env.example. With the embedded (PGlite) database only one
  process can open the data folder: use "Back up now" in Settings, or stop the server first.
*/
import path from 'node:path'
import { backupConfig, createBackup, listBackups } from '../src/server/backup/backup'
import { readArchive } from '../src/server/backup/archive'
import { restoreBackup } from '../src/server/backup/restore'
import { getDb } from '../src/server/db'

const [cmd, ...args] = process.argv.slice(2)
const cfg = backupConfig()
const fmt = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

async function main() {
  if (cmd === 'backup') {
    const db = await getDb()
    const r = await createBackup(db, cfg)
    console.log(`Backup saved: ${path.join(cfg.dir, r.file)} (${fmt(r.bytes)}, ${r.scans} scans)`)
    if (r.offsite) console.log(r.offsite.ok ? `Copied off-site to ${cfg.offsiteDir}` : `OFF-SITE COPY FAILED: ${r.offsite.error}`)
    if (r.pruned) console.log(`Removed ${r.pruned} old backup(s).`)
  } else if (cmd === 'list') {
    const files = await listBackups(cfg.dir)
    if (!files.length) console.log(`No backups in ${cfg.dir}`)
    for (const f of files) console.log(`${f.name}  ${fmt(f.bytes)}  ${new Date(f.modified).toLocaleString()}`)
  } else if (cmd === 'verify') {
    const file = args.find((a) => !a.startsWith('--'))
    if (!file) throw new Error('Usage: npm run backup:verify -- <file>')
    const { manifest, problems } = await readArchive(path.resolve(file), cfg.passphrase)
    if (problems.length) {
      console.error(`NOT OK: ${problems.join('; ')}`)
      process.exit(1)
    }
    const rows = Object.values(manifest.tables).reduce((a, b) => a + b, 0)
    console.log(`OK: made ${new Date(manifest.created_at).toLocaleString()}, ${rows} records, ${manifest.entries.filter((e) => e.name.startsWith('uploads/')).length} scans, ${manifest.encrypted ? 'encrypted' : 'NOT encrypted'}.`)
  } else if (cmd === 'restore') {
    const file = args.find((a) => !a.startsWith('--'))
    if (!file) throw new Error('Usage: npm run backup:restore -- <file> --yes')
    if (!args.includes('--yes')) throw new Error('Restoring replaces every record on this server. Stop the server, then run again with --yes.')
    const r = await restoreBackup(await getDb(), path.resolve(file), cfg.passphrase, cfg.uploadsDir)
    console.log(`Restored ${Object.values(r.tables).reduce((a, b) => a + b, 0)} records and ${r.scans} scans from the backup made ${new Date(r.created_at).toLocaleString()}. Everyone must sign in again.`)
  } else {
    console.log('Usage: npm run backup | backup:list | backup:verify -- <file> | backup:restore -- <file> --yes')
    process.exit(cmd ? 1 : 0)
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`Error: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  },
)
