import type { NextConfig } from 'next'

const config: NextConfig = {
  // PGlite ships WASM + data files that must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres', '@peculiar/x509', 'tsyringe', 'reflect-metadata'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          // Camera only for this site (photos of old folders); no microphone or location.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default config
