'use client'

/**
 * Sync health indicator, always visible at the top of the Log tab.
 *
 * Shows:
 *   - Online/offline status
 *   - Pending trip count (waiting to sync to Supabase)
 *   - Age of oldest pending trip (so stalled syncs are visible)
 *   - "Retry sync" button when pending > 0 AND online
 *
 * Why this exists: trips are saved locally (Dexie) immediately, then
 * synced async. Without a visible indicator, a sync can silently stall
 * for hours (token expired, server hiccup, network flap) and the
 * observer thinks everything is fine. This component makes the
 * current state obvious and gives the analyst a manual force-retry.
 */

import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createClient } from '@/lib/supabase/client'
import { db, drainPending } from '@/lib/fieldlog/offline-trip-queue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'

interface Props {
  assessmentId: string
}

function useFormatRelative() {
  const { t } = useLogT()
  return (iso: string): string => {
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 60_000) return t('time.just_now')
    const min = Math.floor(ms / 60_000)
    if (min < 60) return `${min} ${t('time.min_ago')}`
    const h = Math.floor(min / 60)
    const m = min % 60
    return t('time.h_m_ago', { h, m })
  }
}

export default function SyncStatusBar({ assessmentId }: Props) {
  const supabase = createClient()
  const online = useOnlineStatus()
  const { t } = useLogT()
  const formatRelative = useFormatRelative()
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const pendingTrips = useLiveQuery(
    () => db.pendingTrips.where('assessmentId').equals(assessmentId).toArray(),
    [assessmentId],
    [],
  )
  const pendingCount = pendingTrips?.length ?? 0
  const oldestPending = pendingTrips && pendingTrips.length > 0
    ? [...pendingTrips].sort((a, b) =>
        new Date(a.finalisedAt).getTime() - new Date(b.finalisedAt).getTime()
      )[0]
    : null
  const oldestAgeMs = oldestPending
    ? Date.now() - new Date(oldestPending.finalisedAt).getTime()
    : 0
  // Stalled = pending for more than 5 minutes despite being online
  const stalled = online && oldestAgeMs > 5 * 60 * 1000 && pendingCount > 0

  const handleRetry = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    setLastError(null)
    try {
      const result = await drainPending(async (payload) => {
        const { error } = await supabase.from('daily_logs').insert(payload)
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      })
      if (result.synced > 0) {
        setLastSync(new Date().toISOString())
      }
      if (result.failed > 0) {
        // Try to read the most recent lastSyncError from remaining pending trips
        const remaining = await db.pendingTrips
          .where('assessmentId').equals(assessmentId).toArray()
        const err = remaining.find(t => t.lastSyncError)?.lastSyncError
        setLastError(err ?? `${result.failed} trips failed to sync`)
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [syncing, supabase, assessmentId])

  // ── Rendering ──

  // Offline
  if (!online) {
    return (
      <div style={{
        background: '#FDEDEC', border: '1px solid #E8A39B',
        borderRadius: '10px', padding: '8px 12px', marginBottom: '12px',
        fontSize: '12px', color: '#8B3A2E',
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '14px' }}>●</span>
        <strong><Bilingual k="sync.offline" inline /></strong>
        {pendingCount > 0 && (
          <span>· {pendingCount} {t('sync.offline_suffix')}</span>
        )}
      </div>
    )
  }

  // Online, all synced
  if (pendingCount === 0) {
    return (
      <div style={{
        background: '#E1F5EE', border: '1px solid #A8D9C5',
        borderRadius: '10px', padding: '8px 12px', marginBottom: '12px',
        fontSize: '12px', color: '#0F6E56',
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '14px' }}>●</span>
        <strong><Bilingual k="sync.online_all_synced" inline /></strong>
        {lastSync && <span style={{ color: '#0F6E56aa' }}>· {t('sync.last_sync')} {formatRelative(lastSync)}</span>}
      </div>
    )
  }

  // Online, pending > 0
  const bg = stalled ? '#FDEDEC' : '#FFF4D6'
  const border = stalled ? '#E8A39B' : '#F1D79A'
  const color = stalled ? '#8B3A2E' : '#B7950B'
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: '10px', padding: '8px 12px', marginBottom: '12px',
      fontSize: '12px', color,
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '14px' }}>{stalled ? '⚠' : '⏳'}</span>
      <strong>{pendingCount} <Bilingual k="sync.pending" inline /></strong>
      {oldestPending && (
        <span>· {t('sync.oldest')} {formatRelative(oldestPending.finalisedAt)}</span>
      )}
      {lastError && (
        <span style={{ fontStyle: 'italic' }}>· {lastError}</span>
      )}
      <button
        type="button"
        onClick={handleRetry}
        disabled={syncing}
        style={{
          marginInlineStart: 'auto', padding: '6px 12px',
          background: stalled ? '#C0392B' : '#B7950B', color: '#fff',
          border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
          cursor: syncing ? 'not-allowed' : 'pointer', minHeight: '32px',
          opacity: syncing ? 0.6 : 1,
        }}
      >
        {syncing ? <Bilingual k="sync.syncing" inline /> : <Bilingual k="sync.retry" inline />}
      </button>
    </div>
  )
}
