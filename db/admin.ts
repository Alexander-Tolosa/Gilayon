/*
  Account tools for the clinic server PC, for the day a real database is set up.

    npm run admin -- create-doctor --name "Dr. Juan Dela Cruz" --license 0123456 [--ptr "1234567 · Jan 5, 2027 · Iloilo"]
                     [--title "Physician"] [--room "Room 1"] [--services Medical,Laboratory] [--password <temporary>]
        Creates the first doctor on an empty database. Without --password a temporary one is generated
        and printed once. The doctor must choose their own at first sign-in, then sets a signing PIN in Settings.

    npm run admin -- disable-demo
        Deactivates the seeded demo accounts (shared demo password). Needs a real doctor account first.

    npm run admin -- list
        Lists every staff account and whether it is active.

  With the embedded (PGlite) database only one process can open the data folder: stop the server first.
*/
import { randomInt } from 'node:crypto'
import * as t from './schema'
import { getDb } from '../src/server/db'
import { createFirstDoctor, disableDemoAccounts } from '../src/server/services/admin'

try {
  process.loadEnvFile('.env')
} catch {
  /* no .env file: environment variables only */
}

const [cmd, ...args] = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined
}

/** 12 characters from an alphabet without look-alikes (0/O, 1/l/I), always with letters and a number. */
function temporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = letters + digits
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)], ...Array.from({ length: 10 }, () => all[randomInt(all.length)])]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const SERVICES = ['Medical', 'Dental', 'Laboratory'] as const

async function main() {
  const db = await getDb()
  if (cmd === 'create-doctor') {
    const name = flag('name')
    const license_no = flag('license')
    if (!name || !license_no) throw new Error('Usage: npm run admin -- create-doctor --name "Dr. Name" --license <PRC number> [--ptr ...] [--title ...] [--room ...] [--services Medical,Dental] [--password ...]')
    const services = (flag('services') ?? 'Medical').split(',').map((s) => s.trim())
    const bad = services.filter((s) => !(SERVICES as readonly string[]).includes(s))
    if (bad.length) throw new Error(`Unknown service: ${bad.join(', ')}. Use ${SERVICES.join(', ')}.`)
    const given = flag('password')
    const password = given ?? temporaryPassword()
    const id = await db.transaction((tx) =>
      createFirstDoctor(tx, { name, license_no, ptr_no: flag('ptr'), title: flag('title') ?? 'Physician', room: flag('room'), services: services as (typeof SERVICES)[number][], password }),
    )
    console.log(`Created doctor account ${id} for ${name}.`)
    if (!given) console.log(`Temporary password (shown once, write it down): ${password}`)
    console.log('They must choose their own password at first sign-in, then set a signing PIN in Settings.')
  } else if (cmd === 'disable-demo') {
    const names = await db.transaction((tx) => disableDemoAccounts(tx))
    console.log(names.length ? `Deactivated ${names.length} demo account(s): ${names.join(', ')}` : 'No active demo accounts.')
  } else if (cmd === 'list') {
    const rows = await db.select().from(t.staff)
    for (const r of rows) console.log(`${r.active ? 'active  ' : 'inactive'}  ${r.role.padEnd(6)}  ${r.staff_id.padEnd(12)}  ${r.name}`)
    if (!rows.length) console.log('No accounts yet. Run: npm run admin -- create-doctor --name "Dr. Name" --license <PRC number>')
  } else {
    console.log('Usage: npm run admin -- create-doctor | disable-demo | list   (see db/admin.ts)')
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
