import { getDb } from '../src/server/db'

await getDb()
console.log('Database is up to date.')
process.exit(0)
