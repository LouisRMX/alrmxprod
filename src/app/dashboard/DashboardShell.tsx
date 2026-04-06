'use client'

import { ChatProvider } from '@/context/ChatContext'
import FloatingChat from '@/components/chat/FloatingChat'
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
      <FloatingChat userRole={userRole} isAdmin={isAdmin} />
    </ChatProvider>
  )
}
