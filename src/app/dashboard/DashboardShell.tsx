'use client'

import { ChatProvider } from '@/context/ChatContext'
// OMIX demo hide — uncomment with the <FloatingChat /> usage below after the trip.
// import FloatingChat from '@/components/chat/FloatingChat'
import type { MemberRole } from '@/lib/getEffectiveMemberRole'
import type { ReactNode } from 'react'

interface DashboardShellProps {
  children: ReactNode
  userRole: MemberRole | null
  isAdmin: boolean
}

export default function DashboardShell({ children, userRole, isAdmin }: DashboardShellProps) {
  return (
    <ChatProvider>
      {children}
      {/* OMIX demo hide — uncomment to restore the floating chat after the trip.
          Operators do data entry only, so chat is also role-gated when active.
      {userRole !== 'operator' && <FloatingChat userRole={userRole} isAdmin={isAdmin} />}
      */}
    </ChatProvider>
  )
}
