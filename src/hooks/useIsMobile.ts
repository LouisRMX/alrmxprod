'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true when the viewport width is below the given breakpoint.
 * Safe for SSR — initialises as false (desktop) and updates on mount.
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])

  return isMobile
}
