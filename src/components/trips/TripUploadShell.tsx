'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import TripUploadView from './TripUploadView'
import TripDashboard from './TripDashboard'
import { analyzeTrips, type TripRecord } from '@/lib/trips/analyzer'
import type { ParsedRow } from '@/lib/trips/parser'

interface TripUploadShellProps {
  assessmentId:  string
  targetTAMin:   number    // from calcResult.TARGET_TA
  perMinTACoeff: number    // from calcResult.perMinTACoeff
}

type View = 'loading' | 'upload' | 'dashboard'

interface UploadRecord {
  id:             string
  trip_date:      string
  valid_row_count: number
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function shiftDate(iso: string, days: -1 | 1): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function TripUploadShell({ assessmentId, targetTAMin, perMinTACoeff }: TripUploadShellProps) {
  const supabase = createClient()

  const [view,       setView]       = useState<View>('loading')
  const [trips,      setTrips]      = useState<TripRecord[]>([])
  const [date,       setDate]       = useState(todayIso())
  const [allDates,   setAllDates]   = useState<string[]>([])
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  // Load all upload dates for this assessment (for date nav)
  const loadDates = useCallback(async () => {
    const { data } = await supabase
      .from('trip_uploads')
      .select('trip_date')
      .eq('assessment_id', assessmentId)
      .order('trip_date', { ascending: false })
    setAllDates((data ?? []).map((r: { trip_date: string }) => r.trip_date))
  }, [assessmentId, supabase])

  // Load trips for a given date
  const loadTripsForDate = useCallback(async (d: string) => {
    setView('loading')
    const { data: uploads } = await supabase
      .from('trip_uploads')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('trip_date', d)
      .order('uploaded_at', { ascending: false })
      .limit(1)

    if (!uploads || uploads.length === 0) {
      setTrips([])
      setView('upload')
      return
    }

    const uploadId = (uploads[0] as UploadRecord).id
    const { data: records } = await supabase
      .from('trip_records')
      .select('*')
      .eq('upload_id', uploadId)
      .order('dispatched_at', { ascending: true })

    const mapped: TripRecord[] = (records ?? []).map((r: Record<string, unknown>) => ({
      truckId:           r.truck_id as string,
      tripDate:          r.trip_date as string,
      rowIndex:          0,
      dispatchedAt:      r.dispatched_at as string,
      siteArrivalAt:     r.site_arrival_at as string | null,
      siteDepartureAt:   r.site_departure_at as string | null,
      returnedAt:        r.returned_at as string,
      turnaroundS:       r.turnaround_s as number,
      transitToSiteS:    r.transit_to_site_s as number | null,
      siteDwellS:        r.site_dwell_s as number | null,
      transitBackS:      r.transit_back_s as number | null,
      turnaroundTargetS: r.turnaround_target_s as number,
      turnaroundDelayS:  r.turnaround_delay_s as number,
      estLossUsd:        r.est_loss_usd != null ? Number(r.est_loss_usd) : null,
      anomalyFlags:      r.anomaly_flags as string[],
      dataCompleteness:  r.data_completeness as 'full' | 'partial' | 'minimal',
    }))

    setTrips(mapped)
    setView('dashboard')
  }, [assessmentId, supabase])

  // Initial load
  useEffect(() => {
    if (assessmentId === 'demo') {
      setView('upload')
      return
    }
    loadDates()
    loadTripsForDate(todayIso())
  }, [assessmentId, loadDates, loadTripsForDate])

  // Save imported trips to Supabase
  async function handleImported(newTrips: TripRecord[], importDate: string, filename: string) {
    if (assessmentId === 'demo') {
      // Demo mode: just show in memory, no DB write
      setTrips(newTrips)
      setDate(importDate)
      setView('dashboard')
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      const { data: uploadRow, error: uploadErr } = await supabase
        .from('trip_uploads')
        .insert({
          assessment_id:   assessmentId,
          trip_date:       importDate,
          filename:        filename || null,
          row_count:       newTrips.length,
          valid_row_count: newTrips.length,
        })
        .select('id')
        .single()

      if (uploadErr || !uploadRow) throw new Error(uploadErr?.message ?? 'Failed to create upload record')

      const records = newTrips.map(t => ({
        upload_id:           uploadRow.id,
        assessment_id:       assessmentId,
        truck_id:            t.truckId,
        trip_date:           t.tripDate,
        dispatched_at:       t.dispatchedAt,
        site_arrival_at:     t.siteArrivalAt,
        site_departure_at:   t.siteDepartureAt,
        returned_at:         t.returnedAt,
        turnaround_s:        t.turnaroundS,
        transit_to_site_s:   t.transitToSiteS,
        site_dwell_s:        t.siteDwellS,
        transit_back_s:      t.transitBackS,
        turnaround_target_s: t.turnaroundTargetS,
        turnaround_delay_s:  t.turnaroundDelayS,
        est_loss_usd:        t.estLossUsd,
        anomaly_flags:       t.anomalyFlags,
        data_completeness:   t.dataCompleteness,
      }))

      const { error: recordsErr } = await supabase.from('trip_records').insert(records)
      if (recordsErr) throw new Error(recordsErr.message)

      // Update dates list and show dashboard
      setTrips(newTrips)
      setDate(importDate)
      if (!allDates.includes(importDate)) {
        setAllDates(prev => [importDate, ...prev].sort((a, b) => b.localeCompare(a)))
      }
      setView('dashboard')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function handleDateChange(delta: -1 | 1) {
    const newDate = shiftDate(date, delta)
    setDate(newDate)
    loadTripsForDate(newDate)
  }

  const dateIdx     = allDates.indexOf(date)
  const canGoBack   = dateIdx < allDates.length - 1 || !allDates.includes(date)
  const canGoFwd    = date < todayIso()

  if (view === 'loading' || saving) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
          {saving ? 'Saving trips...' : 'Loading...'}
        </div>
      </div>
    )
  }

  return (
    <div>
      {saveError && (
        <div style={{ padding: '10px 14px', background: '#fff3f3', border: '1px solid #fcc', borderRadius: '7px', fontSize: '13px', color: '#cc3333', marginBottom: '16px' }}>
          Save error: {saveError}
        </div>
      )}

      {view === 'upload' && (
        <TripUploadView
          assessmentId={assessmentId}
          targetTAMin={targetTAMin}
          perMinTACoeff={perMinTACoeff}
          onImported={handleImported}
        />
      )}

      {view === 'dashboard' && (
        <TripDashboard
          trips={trips}
          date={date}
          targetTAMin={targetTAMin}
          onUploadNew={() => setView('upload')}
          onDateChange={handleDateChange}
          canGoBack={canGoBack}
          canGoForward={canGoFwd}
        />
      )}
    </div>
  )
}
