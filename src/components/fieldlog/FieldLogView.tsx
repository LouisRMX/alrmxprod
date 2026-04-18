'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DailyLogRow } from '@/lib/fieldlog/types'
import ManualEntryForm from './ManualEntryForm'
import TripTable from './TripTable'
import UploadParseView from './UploadParseView'
import AudioCaptureView from './AudioCaptureView'
import LiveTripTimer from './live-timer/LiveTripTimer'
import FieldCaptureTokenButton from './FieldCaptureTokenButton'
import FieldLogDiagnostics from './diagnostics/FieldLogDiagnostics'
import { InterventionsEditor } from './InterventionsView'
import ReviewQueue from './ReviewQueue'

type SubTab = 'live' | 'diagnostics' | 'interventions' | 'review' | 'manual' | 'upload' | 'audio'

interface FieldLogViewProps {
  assessmentId: string
  plantId: string
  isAdmin?: boolean
  /** TAT from pre-assessment report, for the expected-vs-measured banner */
  reportedTAT?: number | null
  /** Target TAT from pre-assessment calculations */
  targetTAT?: number | null
}

export default function FieldLogView({ assessmentId, plantId, isAdmin, reportedTAT, targetTAT }: FieldLogViewProps) {
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [logDate, setLogDate] = useState(today)
  const [subTab, setSubTab] = useState<SubTab>('live')
  const [trips, setTrips] = useState<DailyLogRow[]>([])
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  // Autocomplete data from all entries on this assessment
  const [truckIds, setTruckIds] = useState<string[]>([])
  const [driverNames, setDriverNames] = useState<string[]>([])
  const [siteNames, setSiteNames] = useState<string[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)

    // Load trips for selected date. Aggregated KPIs (avg TAT, reject %,
    // truck count) moved to the Track dashboard where they belong.
    const { data: tripData } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('log_date', logDate)
      .order('departure_loaded', { ascending: true })

    setTrips((tripData ?? []) as DailyLogRow[])
    setLoading(false)
  }, [supabase, assessmentId, logDate])

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

  const tabBtn = (tab: SubTab, label: string) => (
    <button type="button" onClick={() => setSubTab(tab)}
      style={{
        padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
        border: `1.5px solid ${subTab === tab ? '#0F6E56' : '#d1d5db'}`,
        background: subTab === tab ? '#e8f5ee' : '#fff',
        color: subTab === tab ? '#0F6E56' : '#888',
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
    <div style={{ padding: '16px', maxWidth: '800px' }}>
      {/* Date picker + token share */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#888' }}>Date</label>
          <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
            style={{
              padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px',
              fontSize: '14px', background: '#fff',
            }} />
        </div>
        {isAdmin && <FieldCaptureTokenButton assessmentId={assessmentId} plantId={plantId} />}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {tabBtn('live', '⏱ Live')}
        {tabBtn('diagnostics', '📊 Diagnostics')}
        {tabBtn('interventions', '⚙ Interventions')}
        {tabBtn('review', '⚠ Review')}
        {tabBtn('manual', 'Manual')}
        {tabBtn('upload', 'Upload')}
        {audioEnabled && tabBtn('audio', 'Audio')}
      </div>

      {/* Active sub-tab */}
      {subTab === 'live' && (
        <div style={{ height: 'calc(100vh - 280px)', minHeight: '500px', background: '#fafafa', borderRadius: '12px', overflow: 'hidden' }}>
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

      {subTab === 'manual' && (
        <ManualEntryForm
          assessmentId={assessmentId}
          plantId={plantId}
          logDate={logDate}
          onSaved={handleSaved}
          existingTruckIds={truckIds}
          existingDriverNames={driverNames}
          existingSiteNames={siteNames}
          tripCount={trips.length}
        />
      )}

      {subTab === 'upload' && (
        <UploadParseView
          assessmentId={assessmentId}
          plantId={plantId}
          logDate={logDate}
          onSaved={handleSaved}
        />
      )}

      {subTab === 'audio' && (
        <AudioCaptureView
          assessmentId={assessmentId}
          plantId={plantId}
          logDate={logDate}
          onSaved={handleSaved}
        />
      )}

      {/* Trip table */}
      <div style={{ marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '10px' }}>
          Logged trips ({trips.length})
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
