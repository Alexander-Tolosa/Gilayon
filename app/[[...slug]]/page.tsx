'use client'

import dynamic from 'next/dynamic'

// The existing React Router app mounts client-side only; it needs window, localStorage and the router.
const Root = dynamic(() => import('../../src/spa/Root'), { ssr: false })

export default function Page() {
  return <Root />
}
