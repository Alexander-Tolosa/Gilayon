import type { NextConfig } from 'next'

const dev = process.env.NODE_ENV !== 'production'

/*
  Content Security Policy. Scripts, styles, fonts and API calls come only from this server. Next.js
  writes small inline scripts to start the page, and the animations set inline styles, so both allow
  'unsafe-inline'; development also needs eval and a websocket for hot reload. Images may be data:/blob:
  (scans, signatures, the letterhead logo) or the two photo hosts used by the public pages.
*/
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://randomuser.me",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const config: NextConfig = {
  // PGlite ships WASM + data files that must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres', '@peculiar/x509', 'tsyringe', 'reflect-metadata'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
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
