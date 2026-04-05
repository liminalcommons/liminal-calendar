'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { MessageSquare, ClipboardList } from 'lucide-react'

interface MobileTabLayoutProps {
  chatPanel: ReactNode
  formPanel: ReactNode
  filledFieldCount?: number
  totalFieldCount?: number
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true) // default desktop for SSR
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

export function MobileTabLayout({ chatPanel, formPanel, filledFieldCount = 0, totalFieldCount = 7 }: MobileTabLayoutProps) {
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<'chat' | 'form'>('chat')

  if (isDesktop) {
    return (
      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 160px)' }}>
        <div className="w-1/2 min-h-0">
          <div className="sticky top-4 h-[calc(100vh-180px)]">
            {chatPanel}
          </div>
        </div>
        <div className="w-1/2">
          {formPanel}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 160px)' }}>
      {/* Tab bar */}
      <div className="flex border-b border-grove-border bg-grove-surface rounded-t-lg overflow-hidden mb-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'text-grove-accent border-b-2 border-grove-accent bg-grove-accent/5'
              : 'text-grove-text-muted hover:text-grove-text'
          }`}
        >
          <MessageSquare size={14} />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('form')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            activeTab === 'form'
              ? 'text-grove-accent border-b-2 border-grove-accent bg-grove-accent/5'
              : 'text-grove-text-muted hover:text-grove-text'
          }`}
        >
          <ClipboardList size={14} />
          Form
          {filledFieldCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-grove-accent/20 text-grove-accent">
              {filledFieldCount}/{totalFieldCount}
            </span>
          )}
        </button>
      </div>

      {/* Active panel */}
      <div className="flex-1">
        {activeTab === 'chat' && (
          <div className="h-[calc(100vh-220px)]">
            {chatPanel}
          </div>
        )}
        {activeTab === 'form' && (
          <div className="py-4">
            {formPanel}
          </div>
        )}
      </div>
    </div>
  )
}
