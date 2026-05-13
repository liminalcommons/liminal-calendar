'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        // Self-heal: FCM endpoints rotate and 410-purged rows drop the DB
        // mapping silently. Re-POST any live subscription on each load so
        // reminders never fail because the row went stale. Idempotent via
        // unique(user_id, endpoint) + onConflictDoNothing.
        const sub = await reg.pushManager.getSubscription()
        if (!sub) return
        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        })
      } catch {
        // best-effort; subscribe-time flow in SubscribePrompt remains source of truth
      }
    })()
  }, [])

  return null
}
