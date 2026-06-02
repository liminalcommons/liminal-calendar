'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Auto-reload once when a freshly-installed worker takes control. This is
    // what guarantees a deployed fix reaches already-installed clients without
    // anyone having to wipe Chrome app data. Guard against reload loops.
    // If there's already a controller, any later controllerchange is an UPDATE
    // (a new worker claimed the page) → reload to run the fixed build. On the
    // first-ever install there's no prior controller, so we don't reload.
    const hadController = !!navigator.serviceWorker.controller
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return
      reloading = true
      window.location.reload()
    })

    void (async () => {
      try {
        // updateViaCache: 'none' bypasses the HTTP cache for the SW script
        // itself, so a stale/broken worker can never keep shadowing the fix.
        const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        // Force an immediate update check on every load — pulls a new worker
        // as soon as one is deployed instead of waiting for Chrome's ~24h poll.
        void reg.update()
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
