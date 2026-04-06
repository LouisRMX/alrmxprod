'use client'

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PageType = 'assessment' | 'plants' | 'unknown'

export interface ChatPageContext {
  pageType: PageType
  plantName?: string
  plantCountry?: string
  assessmentId?: string
  assessmentPhase?: string
  overall?: number | null
  scores?: {
    prod?: number | null
    dispatch?: number | null
    fleet?: number | null
    quality?: number | null
  }
  bottleneck?: string | null
  ebitdaMonthly?: number | null
  hiddenRevMonthly?: number | null
  turnaroundMin?: number | null
  targetTA?: number | null
  dispatchMin?: number | null
  rejectPct?: number | null
  trucks?: number | null
  portfolioSummary?: {
    totalPlants: number
    avgScore: number | null
    totalGap: number
    totalRecovered: number
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<{
  context: ChatPageContext | null
  setContext: (c: ChatPageContext | null) => void
}>({ context: null, setContext: () => {} })

// ── Provider ──────────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ChatPageContext | null>(null)
  return <Ctx.Provider value={{ context, setContext }}>{children}</Ctx.Provider>
}

// ── Hook for pages to push context ───────────────────────────────────────────

/**
 * Call in any client component that has page-specific data (calcResult, plant list etc.)
 * Context is cleared automatically when the component unmounts (page navigation).
 * Effect uses JSON.stringify for deep equality — prevents thrashing on re-renders.
 */
export function useSetChatContext(ctx: ChatPageContext | null) {
  const { setContext } = useContext(Ctx)
  const ref = useRef(setContext)
  ref.current = setContext
  useEffect(() => {
    ref.current(ctx)
    return () => { ref.current(null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ctx)])
}

// ── Hook for FloatingChat to read context ─────────────────────────────────────

export function useChatContext(): ChatPageContext | null {
  return useContext(Ctx).context
}
