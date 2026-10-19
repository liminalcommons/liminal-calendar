'use client'

import { NavBar } from '@/components/NavBar'
import { ScrollableEventList } from '@/components/calendar/ScrollableEventList'

export default function ListPage() {
  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <ScrollableEventList title="Upcoming Events" newEventHref="/events/new" />
    </div>
  )
}
