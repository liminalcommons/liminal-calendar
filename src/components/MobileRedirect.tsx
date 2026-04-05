'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const PREF_KEY = 'calendar-view-preference'

export function MobileRedirect() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Only redirect from home page (weekly view)
    if (pathname !== '/') return
    // Only on mobile
    if (window.innerWidth >= 768) return
    // Respect saved preference — if user explicitly chose weekly, don't redirect
    const pref = localStorage.getItem(PREF_KEY)
    if (pref === 'week') return
    // Default mobile to list
    router.replace('/list')
  }, [pathname, router])

  return null
}
