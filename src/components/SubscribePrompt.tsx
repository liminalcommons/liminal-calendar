'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { X, Calendar, ExternalLink } from 'lucide-react'

const WEBCAL_URL = 'webcal://calendar.castalia.one/api/calendar/feed.ics'
const FEED_URL = 'https://calendar.castalia.one/api/calendar/feed.ics'
const GOOGLE_URL = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL_URL)}`
const OUTLOOK_URL = `https://outlook.live.com/calendar/addcalendar?url=${encodeURIComponent(FEED_URL)}`

const STORAGE_KEY = 'calendar-subscribe-dismissed'

export function SubscribePrompt() {
  const { data: session, status } = useSession()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    // Don't show if already dismissed
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed) return
    // Small delay so it doesn't flash immediately on page load
    const timer = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(timer)
  }, [status])

  const dismiss = () => {
    setShow(false)
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
  }

  const handleSubscribe = (url: string) => {
    window.open(url, '_blank')
    dismiss()
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-grove-surface border border-grove-border rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-grove-accent/20 flex items-center justify-center">
                <Calendar size={20} className="text-grove-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-grove-text">Stay in sync</h2>
                <p className="text-sm text-grove-text-muted">Never miss a community event</p>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="p-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-4">
          <p className="text-sm text-grove-text-muted leading-relaxed mb-4">
            Subscribe to the Liminal Commons Calendar so events show up automatically in your calendar app. All community events will appear alongside your personal schedule.
          </p>

          <div className="space-y-2">
            <button
              onClick={() => handleSubscribe(GOOGLE_URL)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-grove-border hover:bg-grove-border/20 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">📅</span>
                <span className="text-sm font-medium text-grove-text">Google Calendar</span>
              </div>
              <ExternalLink size={14} className="text-grove-text-muted group-hover:text-grove-accent transition-colors" />
            </button>

            <button
              onClick={() => handleSubscribe(WEBCAL_URL)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-grove-border hover:bg-grove-border/20 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">🍎</span>
                <span className="text-sm font-medium text-grove-text">Apple Calendar</span>
              </div>
              <ExternalLink size={14} className="text-grove-text-muted group-hover:text-grove-accent transition-colors" />
            </button>

            <button
              onClick={() => handleSubscribe(OUTLOOK_URL)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-grove-border hover:bg-grove-border/20 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">📧</span>
                <span className="text-sm font-medium text-grove-text">Outlook</span>
              </div>
              <ExternalLink size={14} className="text-grove-text-muted group-hover:text-grove-accent transition-colors" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-grove-bg/50 border-t border-grove-border/50">
          <button
            onClick={dismiss}
            className="w-full text-center text-xs text-grove-text-muted hover:text-grove-text transition-colors py-1"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
