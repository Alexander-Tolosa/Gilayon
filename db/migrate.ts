import { getDb } from '../src/server/db'

try {
  process.loadEnvFile('.env')
} catch {
  /* no .env file: environment variables only */
}

await getDb()
console.log('Database is up to date.')
process.exit(0)
