'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { createClient } from '@/lib/supabase/client'
import type { DailyLogRow } from '@/lib/fieldlog/types'
import TripTable from './TripTable'
import LiveTripTimer from './live-timer/LiveTripTimer'
import AddTripTabs from './AddTripTabs'
import AdminActionsMenu from './AdminActionsMenu'
import FieldLogDiagnostics from './diagnostics/FieldLogDiagnostics'
import { InterventionsEditor } from './InterventionsView'
import ToDoEditor from './ToDoEditor'
import ReviewQueue from './ReviewQueue'
import SyncStatusBar from './SyncStatusBar'
import LocaleToggle from './LocaleToggle'
import LocaleFirstVisitModal from './LocaleFirstVisitModal'
import { LogLocaleProvider, useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'

// 6 sub-tabs: 5 primary (Live, Diagnostics, Interventions, Review, To-do)
// plus one consolidated "add" tab that replaces the former Manual / Upload
// / Audio tabs and selects method via chips inside the tab.
type SubTab = 'live' | 'diagnostics' | 'interventions' | 'review' | 'todo' | 'add'
type ViewRange = 'today' | '7d' | '30d' | 'all'

interface FieldLogViewProps {
  assessmentId: string
  plantId: string
  isAdmin?: boolean
  /** TAT from pre-assessment report, for the expected-vs-measured banner */
  reportedTAT?: number | null
  /** Target TAT from pre-assessment calculations */
  targetTAT?: number | null
}

// Outer wrapper supplies the LogLocaleProvider so every child in the
// Log tree (FieldLogView + all sub-tabs + LiveTimer etc.) can call
// useLogT(). Locale choice persists via localStorage.
export default function FieldLogView(props: FieldLogViewProps) {
  return (
    <LogLocaleProvider>
      <LocaleFirstVisitModal />
      <FieldLogViewInner {...props} />
    </LogLocaleProvider>
  )
}

// Env-based demo swap: when the caller passes the 'demo' sentinel AND the
// demo env vars are set, re-route the entire Log tab to a real seeded
// assessment in Supabase so every sub-component (Live, Diagnostics, Review,
// To-do, etc.) queries the DB normally and shows a fully populated demo.
// Falls back to the historical placeholder if env vars are missing.
const DEMO_ASSESSMENT_ID = process.env.NEXT_PUBLIC_DEMO_ASSESSMENT_ID
const DEMO_PLANT_ID = process.env.NEXT_PUBLIC_DEMO_PLANT_ID

function FieldLogViewInner({ assessmentId, plantId, isAdmin, reportedTAT, targetTAT }: FieldLogViewProps) {
  // Swap demo sentinel for the real seeded IDs when env is configured.
  if (assessmentId === 'demo' && DEMO_ASSESSMENT_ID && DEMO_PLANT_ID) {
    assessmentId = DEMO_ASSESSMENT_ID
    plantId = DEMO_PLANT_ID
  }
  const { t, isRTL } = useLogT()
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const isMobile = useIsMobile()

  const [logDate, setLogDate] = useState(today)
  const [viewRange, setViewRange] = useState<ViewRange>('today')
  const [subTab, setSubTab] = useState<SubTab>('live')
  const [showMoreTabs, setShowMoreTabs] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  // Close the "More" menu when clicking outside of it
  useEffect(() => {
    if (!showMoreTabs) return
    const onClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreTabs(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showMoreTabs])
  const [trips, setTrips] = useState<DailyLogRow[]>([])
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  // Autocomplete data from all entries on this assessment
  const [truckIds, setTruckIds] = useState<string[]>([])
  const [driverNames, setDriverNames] = useState<string[]>([])
  const [siteNames, setSiteNames] = useState<string[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)

    // Load trips for the chosen view range. Aggregated KPIs (avg TAT,
    // reject %, truck count) moved to the Track dashboard where they
    // belong. The date picker above controls the ENTRY date for Manual/
    // Upload/Audio; this range controls what the trip table shows.
    let query = supabase
      .from('daily_logs')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('departure_loaded', { ascending: true })

    if (viewRange === 'today') {
      query = query.eq('log_date', today)
    } else if (viewRange === '7d') {
      const start = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
      query = query.gte('log_date', start)
    } else if (viewRange === '30d') {
      const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      query = query.gte('log_date', start)
    }
    // 'all' applies no date filter

    const { data: tripData } = await query
    setTrips((tripData ?? []) as DailyLogRow[])
    setLoading(false)
  }, [supabase, assessmentId, viewRange, today])

  // Load autocomplete suggestions (all entries on assessment, not just today)
  const loadAutocomplete = useCallback(async () => {
    const { data } = await supabase
      .from('daily_logs')
      .select('truck_id, driver_name, site_name')
      .eq('assessment_id', assessmentId)

    if (data) {
      setTruckIds(Array.from(new Set(data.map(r => r.truck_id).filter(Boolean))) as string[])
      setDriverNames(Array.from(new Set(data.map(r => r.driver_name).filter(Boolean))) as string[])
      setSiteNames(Array.from(new Set(data.map(r => r.site_name).filter(Boolean))) as string[])
    }
  }, [supabase, assessmentId])

  // Check audio feature flag
  useEffect(() => {
    fetch('/api/fieldlog/audio-enabled')
      .then(r => r.json())
      .then(d => setAudioEnabled(d.enabled))
      .catch(() => setAudioEnabled(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadAutocomplete() }, [loadAutocomplete])

  const handleSaved = useCallback(() => {
    loadData()
    loadAutocomplete()
  }, [loadData, loadAutocomplete])

  const tabBtn = (tab: SubTab, label: React.ReactNode) => (
    <button type="button" onClick={() => setSubTab(tab)}
      style={{
        padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
        border: `1.5px solid ${subTab === tab ? '#0F6E56' : '#d1d5db'}`,
        background: subTab === tab ? '#e8f5ee' : '#fff',
        color: subTab === tab ? '#0F6E56' : '#888',
        display: 'inline-flex', alignItems: 'center', gap: '6px',
      }}>
      {label}
    </button>
  )

  // Demo mode: show placeholder
  if (assessmentId === 'demo') {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Field Log</div>
        <div style={{ fontSize: '13px' }}>Field logging is available during on-site assessments. This is a demo view.</div>
      </div>
    )
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} style={{ padding: '16px', maxWidth: '800px' }}>
      {/* Sync health indicator, always visible at top. Observer/analyst
          sees live sync state, age of oldest pending trip, retry button. */}
      <SyncStatusBar assessmentId={assessmentId} />

      {/* Header: locale toggle + date picker (only for Add) + admin menu.
          Date picker is suppressed when the active tab is a live or review
          surface because it only affects backfill via the Add tab. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <LocaleToggle adminMode={isAdmin} />
          {subTab === 'add' && (
            <>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#888' }}><Bilingual k="field.date" /></label>
              <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                style={{
                  padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px',
                  fontSize: '14px', background: '#fff',
                }} />
            </>
          )}
        </div>
        {isAdmin && (
          <AdminActionsMenu assessmentId={assessmentId} plantId={plantId} />
        )}
      </div>

      {/* Sub-tabs: 6 total. On mobile, only the three most-used (Live,
          Review, Add) stay visible; the rest collapse behind a "⋯ More"
          menu to keep the viewport uncluttered for field observers. */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', position: 'relative' }}>
        {tabBtn('live', <><span>⏱</span><Bilingual k="tab.live" /></>)}
        {tabBtn('review', <><span>⚠</span><Bilingual k="tab.review" /></>)}
        {tabBtn('add', <><span>+</span><Bilingual k="tab.add" /></>)}
        {!isMobile && tabBtn('diagnostics', <><span>📊</span><Bilingual k="tab.diagnostics" /></>)}
        {!isMobile && tabBtn('interventions', <><span>⚙</span><Bilingual k="tab.interventions" /></>)}
        {!isMobile && tabBtn('todo', <><span>🎯</span><Bilingual k="tab.todo" /></>)}
        {isMobile && (
          <div ref={moreMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowMoreTabs(v => !v)}
              aria-expanded={showMoreTabs}
              style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                border: `1.5px solid ${['diagnostics', 'interventions', 'todo'].includes(subTab) ? '#0F6E56' : '#d1d5db'}`,
                background: ['diagnostics', 'interventions', 'todo'].includes(subTab) ? '#e8f5ee' : '#fff',
                color: ['diagnostics', 'interventions', 'todo'].includes(subTab) ? '#0F6E56' : '#888',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}
            >
              <span>⋯</span>
              {subTab === 'diagnostics' && <Bilingual k="tab.diagnostics" />}
              {subTab === 'interventions' && <Bilingual k="tab.interventions" />}
              {subTab === 'todo' && <Bilingual k="tab.todo" />}
              {!['diagnostics', 'interventions', 'todo'].includes(subTab) && <Bilingual k="live.more_options" />}
            </button>
            {showMoreTabs && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', insetInlineEnd: 0,
                background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '4px',
                zIndex: 100, minWidth: '180px',
                display: 'flex', flexDirection: 'column', gap: '2px',
              }}>
                {(['diagnostics', 'interventions', 'todo'] as const).map(k => {
                  const active = subTab === k
                  const label = k === 'diagnostics' ? <Bilingual k="tab.diagnostics" />
                    : k === 'interventions' ? <Bilingual k="tab.interventions" />
                    : <Bilingual k="tab.todo" />
                  const icon = k === 'diagnostics' ? '📊' : k === 'interventions' ? '⚙' : '🎯'
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { setSubTab(k); setShowMoreTabs(false) }}
                      style={{
                        textAlign: 'start',
                        padding: '10px 14px', minHeight: '44px',
                        background: active ? '#e8f5ee' : 'transparent',
                        color: active ? '#0F6E56' : '#333',
                        border: 'none', borderRadius: '6px',
                        fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '10px',
                      }}
                    >
                      <span>{icon}</span>{label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active sub-tab */}
      {subTab === 'live' && (
        <div style={{ background: '#fafafa', borderRadius: '12px' }}>
          <LiveTripTimer
            assessmentId={assessmentId}
            plantId={plantId}
            syncMode="authed"
          />
        </div>
      )}

      {subTab === 'diagnostics' && (
        <FieldLogDiagnostics
          assessmentId={assessmentId}
          reportedTAT={reportedTAT ?? null}
          targetTAT={targetTAT ?? null}
        />
      )}

      {subTab === 'interventions' && (
        <InterventionsEditor assessmentId={assessmentId} plantId={plantId} />
      )}

      {subTab === 'review' && (
        <ReviewQueue assessmentId={assessmentId} />
      )}

      {subTab === 'todo' && (
        <ToDoEditor assessmentId={assessmentId} plantId={plantId} />
      )}

      {subTab === 'add' && (
        <AddTripTabs
          assessmentId={assessmentId}
          plantId={plantId}
          logDate={logDate}
          onSaved={handleSaved}
          existingTruckIds={truckIds}
          existingDriverNames={driverNames}
          existingSiteNames={siteNames}
          tripCount={trips.length}
          audioEnabled={audioEnabled}
        />
      )}

      {/* Trip table */}
      <div style={{ marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '10px', flexWrap: 'wrap', marginBottom: '10px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            <Bilingual k="field.logged_trips" /> ({trips.length})
          </div>
          <div style={{ display: 'inline-flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #d1d5db' }}>
            {(['today', '7d', '30d', 'all'] as const).map((r, i) => {
              const label = r === 'today' ? t('diag.today')
                : r === '7d' ? t('diag.last_7')
                : r === '30d' ? t('diag.last_30')
                : t('diag.all')
              const active = viewRange === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setViewRange(r)}
                  style={{
                    padding: '6px 10px',
                    background: active ? '#0F6E56' : '#fff',
                    color: active ? '#fff' : '#555',
                    border: 'none',
                    borderRight: i < 3 ? '1px solid #d1d5db' : 'none',
                    fontSize: '11px', fontWeight: 600,
                    cursor: 'pointer', minHeight: '32px',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '13px' }}>Loading...</div>
        ) : (
          <TripTable trips={trips} isAdmin={isAdmin} onDelete={handleSaved} />
        )}
      </div>
    </div>
  )
}
