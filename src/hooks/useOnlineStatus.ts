/**
 * Tracks browser online/offline state.
 *
 * Navigator.onLine is not a perfect signal (it reports "online" even when
 * the network exists but has no Internet reach), but for our use case it's
 * sufficient: the sync function itself will fail gracefully if the device
 * claims online but cannot actually reach Supabase, and the pending trip
 * stays in the queue for next drain.
 */
import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
