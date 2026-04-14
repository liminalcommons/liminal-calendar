'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { apiFetch } from '@/lib/api-fetch'

const CHECK_INTERVAL = 60_000 // Check every minute
const NOTIFY_WINDOW = 15 * 60_000 // 15 minutes before
const NOTIFY_TOLERANCE = 2 * 60_000 // ±2 minute tolerance

export function NotificationScheduler() {
  const { data: session } = useSession()
  const notifiedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!session?.user) return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    async function checkUpcoming() {
      try {
        const now = new Date()
        const from = now.toISOString()
        const to = new Date(now.getTime() + 20 * 60_000).toISOString()

        const res = await apiFetch(`/api/events?from=${from}&to=${to}&limit=20`)
        if (!res.ok) return
        const data = await res.json()
        const events = data.events || data || []

        for (const event of events) {
          if (!event.starts_at || !event.myResponse || event.myResponse === 'no') continue

          const startTime = new Date(event.starts_at).getTime()
          const diff = startTime - now.getTime()

          // Within the 15-min window (13-17 min before)
          if (diff > NOTIFY_WINDOW - NOTIFY_TOLERANCE && diff < NOTIFY_WINDOW + NOTIFY_TOLERANCE) {
            const key = `${event.id}-15min`
            if (notifiedRef.current.has(key)) continue
            notifiedRef.current.add(key)

            // Build the click URL — meeting link if available, otherwise event page
            const url = event.event_url || `/events/${event.id}`

            const reg = await navigator.serviceWorker?.ready
            if (reg) {
              reg.showNotification(`${event.title} — starting soon`, {
                body: 'Starts in 15 minutes. Tap to join.',
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: key,
                renotify: true,
                data: { url },
              } as NotificationOptions)
            } else {
              new Notification(`${event.title} — starting soon`, {
                body: 'Starts in 15 minutes. Tap to join.',
                icon: '/icon-192.png',
                tag: key,
              })
            }
          }
        }
      } catch {
        // Silently fail — notification is best-effort
      }
    }

    checkUpcoming()
    const timer = setInterval(checkUpcoming, CHECK_INTERVAL)
    return () => clearInterval(timer)
  }, [session])

  return null
}
