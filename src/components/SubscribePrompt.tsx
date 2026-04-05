'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Calendar, ExternalLink, Check } from 'lucide-react'

const WEBCAL_URL = 'webcal://calendar.castalia.one/api/calendar/feed.ics'
const FEED_URL = 'https://calendar.castalia.one/api/calendar/feed.ics'
const GOOGLE_URL = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(WEBCAL_URL)}`
const OUTLOOK_URL = `https://outlook.live.com/calendar/addcalendar?url=${encodeURIComponent(FEED_URL)}`

const STORAGE_KEY = 'calendar-subscribe-dismissed'

type Step = 'prompt' | 'confirm' | 'done'

export function SubscribePrompt() {
  const { data: session, status } = useSession()
  const [show, setShow] = useState(false)
  const [step, setStep] = useState<Step>('prompt')

  useEffect(() => {
    if (status !== 'authenticated') return
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed) return
    const timer = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(timer)
  }, [status])

  const handleSubscribe = (url: string) => {
    window.open(url, '_blank')
    setStep('confirm')
  }

  const handleConfirm = () => {
    setStep('done')
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
    setTimeout(() => setShow(false), 1500)
  }

  const handleNotYet = () => {
    setStep('prompt')
  }

  const handleSkip = () => {
    setShow(false)
  }

  if (!show) return null

  // Step 3: Success
  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-grove-surface border border-grove-border rounded-xl shadow-2xl max-w-sm w-full mx-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-grove-accent/20 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-grove-accent" />
          </div>
          <h2 className="text-lg font-semibold text-grove-text mb-2">All set!</h2>
          <p className="text-sm text-grove-text-muted">Community events will now appear in your calendar.</p>
        </div>
      </div>
    )
  }

  // Step 2: Confirm subscription
  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-grove-surface border border-grove-border rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-grove-accent/20 flex items-center justify-center">
                <Calendar size={20} className="text-grove-accent" />
              </div>
              <h2 className="text-lg font-semibold text-grove-text">Did you complete the subscription?</h2>
            </div>
            <p className="text-sm text-grove-text-muted leading-relaxed mb-5">
              A new tab should have opened to add the calendar. If you completed the steps there, confirm below.
            </p>

            <div className="space-y-2">
              <button
                onClick={handleConfirm}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-grove-accent-deep text-grove-surface font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                <Check size={16} />
                Yes, I subscribed
              </button>
              <button
                onClick={handleNotYet}
                className="w-full px-4 py-2.5 rounded-lg border border-grove-border text-sm text-grove-text hover:bg-grove-border/20 transition-colors"
              >
                Not yet, show me the options again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Step 1: Subscribe prompt
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-grove-surface border border-grove-border rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-grove-accent/20 flex items-center justify-center">
              <Calendar size={20} className="text-grove-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-grove-text">One more step</h2>
              <p className="text-sm text-grove-text-muted">Sync events to your calendar</p>
            </div>
          </div>
          <p className="text-sm text-grove-text leading-relaxed">
            Subscribe so community events appear alongside your personal schedule. No more missing gatherings or double-booking.
          </p>
        </div>

        {/* Subscribe options */}
        <div className="px-6 pb-4 space-y-2">
          <button
            onClick={() => handleSubscribe(GOOGLE_URL)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">📅</span>
              <span className="text-sm font-semibold">Subscribe with Google Calendar</span>
            </div>
            <ExternalLink size={14} />
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => handleSubscribe(WEBCAL_URL)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-grove-border hover:bg-grove-border/20 transition-colors"
            >
              <span>🍎</span>
              <span className="text-xs font-medium text-grove-text">Apple</span>
            </button>
            <button
              onClick={() => handleSubscribe(OUTLOOK_URL)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-grove-border hover:bg-grove-border/20 transition-colors"
            >
              <span>📧</span>
              <span className="text-xs font-medium text-grove-text">Outlook</span>
            </button>
          </div>
        </div>

        {/* Skip */}
        <div className="px-6 py-2.5 border-t border-grove-border/30">
          <button
            onClick={handleSkip}
            className="w-full text-center text-[11px] text-grove-text-dim hover:text-grove-text-muted transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
