'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings, Volume2, VolumeX, CalendarPlus, LogOut } from 'lucide-react'
import Link from 'next/link'
import { calendarSFX } from '@/lib/sound-manager'

const WEBCAL_URL = 'webcal://calendar.castalia.one/api/calendar/feed.ics'
const FEED_URL = 'https://calendar.castalia.one/api/calendar/feed.ics'
const GOOGLE_URL = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(FEED_URL)}`
const OUTLOOK_URL = `https://outlook.live.com/calendar/addcalendar?url=${encodeURIComponent(FEED_URL)}`

interface NavGearMenuProps {
  isAdmin: boolean
  onSignOut: () => void
}

export function NavGearMenu({ isAdmin, onSignOut }: NavGearMenuProps) {
  const [open, setOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [subExpanded, setSubExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMuted(calendarSFX.isMuted())
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
