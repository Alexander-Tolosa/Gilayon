import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../src/index.css'

export const metadata: Metadata = {
  title: 'Gilayon · HMO-Clinic Digital Records',
  description:
    "Gilayon: digital records for the HMO-Clinic. Verified check-in, a priority queue, signed prescriptions and certificates, and a daily report, working offline on the clinic's own computers.",
  manifest: '/manifest.webmanifest',
  icons: { icon: '/logo.png', apple: '/apple-icon.png' },
  appleWebApp: { capable: true, title: 'Gilayon' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2350d6',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
