/**
 * Stopwatch hook for a single active trip.
 *
 * - Ticks once per second
 * - Returns elapsed time since trip start, and since current stage start
 * - Formats as MM:SS up to 60 min, HH:MM:SS beyond
 *
 * The hook does not persist state; that's the job of offline-trip-queue.
 * It reads the timestamps from the ActiveTrip and derives display strings.
 */
import { useEffect, useState } from 'react'
import type { ActiveTrip, StageName } from '@/lib/fieldlog/offline-trip-queue'

export interface StopwatchDisplay {
  /** Total trip elapsed, formatted. */
  totalElapsed: string
  /** Current stage elapsed, formatted. */
  stageElapsed: string
  /** Raw total seconds. */
  totalSeconds: number
  /** Raw current-stage seconds. */
  stageSeconds: number
}

function formatDuration(seconds: number): string {
  if (seconds < 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function useStopwatch(trip: ActiveTrip | null): StopwatchDisplay {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!trip) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [trip])

  if (!trip) {
    return { totalElapsed: '00:00', stageElapsed: '00:00', totalSeconds: 0, stageSeconds: 0 }
  }

  const tripStartIso = trip.timestamps.plant_queue
  const tripStartMs = tripStartIso ? new Date(tripStartIso).getTime() : now
  const totalSeconds = Math.max(0, Math.floor((now - tripStartMs) / 1000))

  const stage: StageName = trip.currentStage
  const stageStartIso = trip.timestamps[stage]
  const stageStartMs = stageStartIso ? new Date(stageStartIso).getTime() : tripStartMs
  const stageSeconds = Math.max(0, Math.floor((now - stageStartMs) / 1000))

  return {
    totalElapsed: formatDuration(totalSeconds),
    stageElapsed: formatDuration(stageSeconds),
    totalSeconds,
    stageSeconds,
  }
}
