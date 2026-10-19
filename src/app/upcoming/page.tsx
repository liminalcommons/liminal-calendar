'use client'

import { useResolvedRole } from '@/lib/use-resolved-role'
import { NavBar } from '@/components/NavBar'
import { UpcomingView } from '@/components/calendar/UpcomingView'

export default function UpcomingPage() {
  const { role } = useResolvedRole()
  const showCreate = role === 'host' || role === 'admin' || role === 'owner'
  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <UpcomingView showCreate={showCreate} />
    </div>
  )
}
