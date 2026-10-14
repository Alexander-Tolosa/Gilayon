import type { NextConfig } from 'next'

const config: NextConfig = {
  // PGlite ships WASM + data files that must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
}

export default config
