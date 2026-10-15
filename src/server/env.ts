/*
  Settings that used the old product name. Each one now reads GILAYON_<NAME> first and falls back to
  the old HIMSOG_<NAME>, so a server set up before the rename keeps working unchanged.
*/
export function setting(name: 'AUTO_SEED' | 'ALLOW_RESET' | 'HOSTNAMES', env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[`GILAYON_${name}`] ?? env[`HIMSOG_${name}`]
}

/**
 * The demo server: the embedded database filled with the synthetic clinic. A real clinic server uses
 * DATABASE_URL (or turns auto-seeding off), and then demo helpers such as "Try the demo", the filled-in
 * password and the "synthetic demo data" footers are hidden. NEXT_PUBLIC_DEMO=1 or 0 overrides it.
 */
export function isDemoServer(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEXT_PUBLIC_DEMO === '1') return true
  if (env.NEXT_PUBLIC_DEMO === '0') return false
  return !env.DATABASE_URL && setting('AUTO_SEED', env) !== '0'
}
