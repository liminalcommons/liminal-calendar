'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Calendar, ExternalLink, Check, Bell } from 'lucide-react'
import { useFeedUrls } from '@/lib/use-feed-urls'
import { apiFetch } from '@/lib/api-fetch'

const STORAGE_KEY = 'calendar-subscribe-dismissed'

type Step = 'notifications' | 'subscribe' | 'confirm' | 'done'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i)
  return buffer
}

export function SubscribePrompt() {
  const { status } = useSession()
  const [show, setShow] = useState(false)
  const [step, setStep] = useState<Step>('notifications')
  const [pushLoading, setPushLoading] = useState(false)
  const { webcalUrl, googleUrl, outlookUrl } = useFeedUrls()

  useEffect(() => {
    if (status !== 'authenticated') return
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed) return
    // Skip notifications step if not supported or already granted
    const initialStep: Step =
      ('PushManager' in window && Notification.permission !== 'granted')
        ? 'notifications'
        : 'subscribe'
    setStep(initialStep)
    const timer = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(timer)
  }, [status])

  const handleSubscribe = (url: string) => {
    window.open(url, '_blank')
    setStep('confirm')
  }

  const handleConfirm = () => {
    finishOnboarding()
  }

  const handleNotYet = () => {
    setStep('subscribe')
  }

  const handleEnableNotifications = async () => {
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        const reg = await navigator.serviceWorker.ready
        const res = await apiFetch('/api/push/vapid-key')
        const { publicKey } = await res.json()
        if (publicKey) {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          })
          await apiFetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          })
        }
      }
    } catch (err) {
      console.error('[push] subscribe failed:', err)
    } finally {
      setPushLoading(false)
      setStep('subscribe')
    }
  }

  const finishOnboarding = () => {
    setStep('done')
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
    setTimeout(() => setShow(false), 1500)
  }

  const handleSkip = () => {
    setShow(false)
  }

  const handleNeverAsk = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
    setShow(false)
  }

  const handleSkipNotifications = () => {
    setStep('subscribe')
  }

  if (!show) return null

  // Step 4: Success
  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-grove-surface border border-grove-border rounded-xl shadow-2xl max-w-sm w-full mx-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-grove-accent/20 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-grove-accent" />
          </div>
          <h2 className="text-lg font-semibold text-grove-text mb-2">All set!</h2>
          <p className="text-sm text-grove-text-muted">Community events will sync to your calendar and you&apos;ll get notified before they start.</p>
        </div>
      </div>
    )
  }

  // Step 3: Enable notifications
  if (step === 'notifications') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-grove-surface border border-grove-border rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-grove-accent/20 flex items-center justify-center">
                <Bell size={20} className="text-grove-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-grove-text">Never miss a gathering</h2>
                <p className="text-sm text-grove-text-muted">Step 1 of 2</p>
              </div>
            </div>
            <p className="text-sm text-grove-text leading-relaxed mb-5">
              Get a notification <strong>15 minutes before</strong> events you RSVP to. Just enough time to grab a drink and show up.
            </p>

            <div className="space-y-2">
              <button
                onClick={handleEnableNotifications}
                disabled={pushLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-grove-accent-deep text-grove-surface font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Bell size={16} />
                {pushLoading ? 'Setting up...' : 'Enable notifications'}
              </button>
              <button
                onClick={handleSkipNotifications}
                className="w-full px-4 py-2.5 rounded-lg border border-grove-border text-sm text-grove-text hover:bg-grove-border/20 transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>

          <div className="px-6 py-2.5 border-t border-grove-border/30">
            <p className="text-center text-[10px] text-grove-text-dim">
              You can change this anytime in Settings
            </p>
          </div>
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
              <h2 className="text-lg font-semibold text-grove-text">Stay in the loop</h2>
              <p className="text-sm text-grove-text-muted">Step 2 of 2</p>
            </div>
          </div>
          <p className="text-sm text-grove-text leading-relaxed">
            Subscribe so community events appear alongside your personal schedule. No more missing gatherings or double-booking.
          </p>
        </div>

        {/* Subscribe options */}
        <div className="px-6 pb-4 space-y-2">
          <button
            onClick={() => handleSubscribe(googleUrl)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">G</span>
              <span className="text-sm font-semibold">Subscribe with Google Calendar</span>
            </div>
            <ExternalLink size={14} />
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => handleSubscribe(webcalUrl)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-grove-border hover:bg-grove-border/20 transition-colors"
            >
              <span className="text-xs font-medium text-grove-text">Apple Calendar</span>
            </button>
            <button
              onClick={() => handleSubscribe(outlookUrl)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-grove-border hover:bg-grove-border/20 transition-colors"
            >
              <span className="text-xs font-medium text-grove-text">Outlook</span>
            </button>
          </div>
        </div>

        {/* Skip */}
        <div className="px-6 py-2.5 border-t border-grove-border/30 flex items-center justify-between gap-4">
          <button
            onClick={handleSkip}
            className="text-[11px] text-grove-text-dim hover:text-grove-text-muted transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleNeverAsk}
            className="text-[11px] text-grove-text-dim hover:text-grove-text-muted transition-colors"
          >
            Don&apos;t ask again
          </button>
        </div>
      </div>
    </div>
  )
}
