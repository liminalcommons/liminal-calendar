'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings, Volume2, VolumeX, CalendarPlus, LogOut, Bell, BellOff } from 'lucide-react'
import Link from 'next/link'
import { calendarSFX } from '@/lib/sound-manager'
import { apiFetch } from '@/lib/api-fetch'

const WEBCAL_URL = 'webcal://calendar.castalia.one/api/calendar/feed.ics'
const FEED_URL = 'https://calendar.castalia.one/api/calendar/feed.ics'
// Google Calendar's cid= param requires webcal:// to recognize the URL as an
// external ICS subscription. cid=https://... causes desktop Google Calendar to
// show "Unable to add this calendar. Please check the URL." On Android, Chrome
// hands this link to the Google Calendar app which handles webcal:// fine; on
// iOS it opens Safari → Google Calendar web, which also accepts webcal://.
const GOOGLE_URL = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL_URL)}`
const OUTLOOK_URL = `https://outlook.live.com/calendar/addcalendar?url=${encodeURIComponent(FEED_URL)}`

interface NavGearMenuProps {
  isAdmin: boolean
  onSignOut: () => void
}

export function NavGearMenu({ isAdmin, onSignOut }: NavGearMenuProps) {
  const [open, setOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [subExpanded, setSubExpanded] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMuted(calendarSFX.isMuted())
    // Check if push is already subscribed
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setPushEnabled(!!sub)
        })
      })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSubExpanded(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggleMute = () => {
    const next = !muted
    calendarSFX.setMuted(next)
    setMuted(next)
    if (!next) calendarSFX.play('navigate')
  }

  const togglePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (pushEnabled) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await sub.unsubscribe()
          await apiFetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
        }
        setPushEnabled(false)
      } else {
        // Subscribe — must explicitly request notification permission first.
        // pushManager.subscribe only implicitly prompts on Chrome and only when
        // permission state is 'default'; Safari/Firefox/older Chrome require the
        // explicit Notification.requestPermission() call to surface the OS prompt.
        if (Notification.permission === 'denied') {
          console.warn('[push] notifications blocked — user must re-enable in browser settings')
          return
        }
        if (Notification.permission !== 'granted') {
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') return
        }

        const res = await apiFetch('/api/push/vapid-key')
        const { publicKey } = await res.json()
        if (!publicKey) return

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
        await apiFetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        })
        setPushEnabled(true)
      }
    } catch (err) {
      console.error('[push] toggle failed:', err)
    } finally {
      setPushLoading(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setSubExpanded(false) }}
        className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
        aria-label="Settings"
      >
        <Settings size={14} />
        <span className="text-[8px] leading-none">More</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-grove-surface border border-grove-border rounded-lg shadow-lg py-1 min-w-[160px] z-50">
          <button
            onClick={toggleMute}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-grove-text hover:bg-grove-border/30 transition-colors"
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            {muted ? 'Unmute sounds' : 'Mute sounds'}
          </button>

          {'PushManager' in window && (
            <button
              onClick={togglePush}
              disabled={pushLoading}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-grove-text hover:bg-grove-border/30 transition-colors disabled:opacity-50"
            >
              {pushEnabled ? <BellOff size={13} /> : <Bell size={13} />}
              {pushLoading ? 'Setting up...' : pushEnabled ? 'Disable notifications' : 'Enable notifications'}
            </button>
          )}

          <button
            onClick={() => setSubExpanded(!subExpanded)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-grove-text hover:bg-grove-border/30 transition-colors"
          >
            <CalendarPlus size={13} />
            Subscribe
          </button>
          {subExpanded && (
            <div className="pl-8 py-1">
              <a href={GOOGLE_URL} target="_blank" rel="noopener noreferrer" className="block px-3 py-1.5 text-[11px] text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors">Google Calendar</a>
              <a href={WEBCAL_URL} className="block px-3 py-1.5 text-[11px] text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors">Apple Calendar</a>
              <a href={OUTLOOK_URL} target="_blank" rel="noopener noreferrer" className="block px-3 py-1.5 text-[11px] text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors">Outlook</a>
            </div>
          )}

          {isAdmin && (
            <>
              <div className="border-t border-grove-border my-1" />
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-grove-text hover:bg-grove-border/30 transition-colors"
              >
                <Settings size={13} />
                Admin
              </Link>
            </>
          )}

          <div className="border-t border-grove-border my-1" />
          <button
            onClick={() => { setOpen(false); onSignOut() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i)
  return buffer
}
