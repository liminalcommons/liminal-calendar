'use client'

import { useState, useEffect } from 'react'
import type { DisplayEvent } from '@/lib/display-event'

interface EventCountdownProps {
  event: DisplayEvent
}

function computeCountdown(startsAt: string, endsAt: string | null) {
  const now = Date.now()
  const start = new Date(startsAt).getTime()
  const end = endsAt ? new Date(endsAt).getTime() : null

  // Event is live
  if (now >= start && end && now < end) {
    return { live: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  // Event is past
  if (now >= start) {
    return null
  }

  const diff = start - now
  const days = Math.floor(diff / 86400_000)
  const hours = Math.floor((diff % 86400_000) / 3600_000)
  const minutes = Math.floor((diff % 3600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)

  return { live: false, days, hours, minutes, seconds }
}

export function EventCountdown({ event }: EventCountdownProps) {
  const [mounted, setMounted] = useState(false)
  const [countdown, setCountdown] = useState<ReturnType<typeof computeCountdown>>(null)

  useEffect(() => {
    setMounted(true)
    const update = () => setCountdown(computeCountdown(event.starts_at, event.ends_at))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [event.starts_at, event.ends_at])

  if (!mounted) {
    return (
      <div className="bg-grove-surface rounded-lg border border-grove-border/20 p-4 mb-6 animate-pulse h-16" />
    )
  }

  if (!countdown) return null

  if (countdown.live) {
    return (
      <div className="bg-grove-accent/10 border border-grove-accent/30 rounded-lg p-4 mb-6 text-center">
        <div className="text-grove-accent font-serif text-lg font-semibold tracking-wide">
          NOW LIVE
        </div>
        <div className="text-xs text-grove-text-muted mt-1">{event.title}</div>
      </div>
    )
  }

  const parts: string[] = []
  if (countdown.days > 0) parts.push(`${countdown.days}d`)
  parts.push(`${countdown.hours}h`)
  parts.push(`${String(countdown.minutes).padStart(2, '0')}m`)
  parts.push(`${String(countdown.seconds).padStart(2, '0')}s`)

  return (
    <div className="bg-grove-surface rounded-lg border border-grove-border/20 p-4 mb-6">
      <div className="text-[10px] uppercase tracking-[2px] text-grove-text-muted mb-1">
        Next event in
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl text-grove-text font-light tracking-wider">
          {parts.join(' ')}
        </span>
      </div>
      <div className="text-xs text-grove-text-muted mt-1 truncate">{event.title}</div>
    </div>
  )
}
