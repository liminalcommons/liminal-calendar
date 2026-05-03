'use client'

import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

const STORAGE_KEY = 'calendar-install-dismissed'
const DISMISS_DAYS = 7

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [iosMode, setIosMode] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10)
      if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return
    }

    // Already installed (any platform)
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // iOS-specific standalone check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window.navigator as any).standalone === true) return

    const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
      'standalone' in window.navigator

    if (isIOS) {
      setIosMode(true)
      setShow(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') {
      localStorage.setItem(STORAGE_KEY, Date.now().toString())
    }
    setDeferredPrompt(null)
    setShow(false)
  }

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
    setShow(false)
  }

  if (!show) return null

  if (iosMode) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-40 sm:left-auto sm:right-4 sm:max-w-sm">
        <div className="bg-grove-surface border border-grove-border rounded-xl shadow-lg p-4">
          <div className="flex items-start gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-grove-accent/20 flex items-center justify-center shrink-0">
              <Download size={20} className="text-grove-accent" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-grove-text">Add to Home Screen</p>
              <p className="text-xs text-grove-text-muted">For notifications and the full experience</p>
            </div>
            <button onClick={handleDismiss} className="p-1 text-grove-text-muted hover:text-grove-text">
              <X size={14} />
            </button>
          </div>
          <ol className="text-xs text-grove-text-muted space-y-1 ml-12 list-decimal">
            <li>Tap the Share button at the bottom of Safari</li>
            <li>Scroll down and tap &quot;Add to Home Screen&quot;</li>
            <li>Tap &quot;Add&quot; in the top-right corner</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="bg-grove-surface border border-grove-border rounded-xl shadow-lg p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-grove-accent/20 flex items-center justify-center shrink-0">
          <Download size={20} className="text-grove-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-grove-text">Install Calendar</p>
          <p className="text-xs text-grove-text-muted">Add to home screen for quick access</p>
        </div>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-grove-accent-deep text-grove-surface hover:opacity-90 transition-opacity shrink-0"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 text-grove-text-muted hover:text-grove-text transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
