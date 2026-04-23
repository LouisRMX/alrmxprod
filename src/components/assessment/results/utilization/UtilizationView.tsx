'use client'

/**
 * UtilizationView — Results → Utilization sub-tab.
 *
 * One-page flow for the TrackUS Stop Details utilization analysis:
 *   1. Hero-card (if result exists) — headline USD gap + metrics
 *   2. Multi-file upload (drag-drop XLS)
 *   3. Plant confirmation — user labels top-2 clusters Malham/Derab
 *   4. Profile entry — batching mixer count per plant
 *   5. "Compute utilization" button → shows refreshed hero
 *
 * Reads from /api/gps/utilization/latest on mount; renders empty state
 * until a computation has run. Does not touch the existing GPS CSV flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'

interface Props {
  assessmentId: string
}

// ── Types mirroring API responses ────────────────────────────────────────

interface ClusterCandidate {
  clusterKey: string
  centroid: { lat: number; lon: number }
  stopCount: number
  distinctTrucks: number
  mixerShare: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

interface OutlierProfile {
  truckId: string
  totalStops: number
  regionShare: number
  note: string
}

interface ParseSummary {
  assessmentId: string
  filesAccepted: number
  filesRejected: number
  eventsIngested: number
  eventsInScope: number
  trucksInScope: number
  trucksOutOfScope: number
  trucksOutliers: number
  outlierProfiles: OutlierProfile[]
  plantCandidates: ClusterCandidate[]
  rejections: Array<{ filename: string; reason: string; detail: string }>
}

interface UtilizationResult {
  id: string
  computed_at: string
  window_start: string
  window_end: string
  operating_days: number
  fridays_excluded: number
  low_activity_days_excluded: number
  events_total: number
  trucks_in_scope: number
  trucks_outlier: number
  outlier_profiles: OutlierProfile[]
  current_loads_per_op_day: number | null
  current_trips_per_truck_per_op_day: number | null
  demonstrated_loads_per_op_day: number | null
  demonstrated_trips_per_truck_per_op_day: number | null
  demonstrated_weeks: Array<{ weekStart: string; loadsPerOpDay: number }>
  peak_loads_per_op_day: number | null
  peak_week_start: string | null
  gap_loads_per_op_day: number | null
  monthly_value_usd: number | null
  plant_breakdown: Array<{
    plant_slug: string
    plant_name: string
    total_plant_loads: number
    share_of_loads: number
  }>
  computation_notes: Array<{ note: string }>
}

interface PlantProfileRow {
  plant_slug: string
  plant_name: string
  centroid_lat: number
  centroid_lon: number
  batching_mixer_count: number
}

interface IngestedSummary {
  totalEvents: number
  dateRange: { start: string; end: string } | null
  distinctTrucks: number
  fileCount: number
  files: Array<{ filename: string; created_at: string; eventsCount: number }>
}

type PlantDraft = {
  clusterKey: string
  centroidLat: number
  centroidLon: number
  plantName: string
  batchingMixers: number
}

// ── Component ────────────────────────────────────────────────────────────

export default function UtilizationView({ assessmentId }: Props) {
  const isMobile = useIsMobile()

  const [result, setResult] = useState<UtilizationResult | null>(null)
  const [profiles, setProfiles] = useState<PlantProfileRow[]>([])
  const [ingested, setIngested] = useState<IngestedSummary | null>(null)
  const [loading, setLoading] = useState(true)

  // Upload + parse state
  const [parsing, setParsing] = useState(false)
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseProgress, setParseProgress] = useState<{ done: number; total: number } | null>(null)

  // Plant-confirm drafts
  const [plantDrafts, setPlantDrafts] = useState<PlantDraft[]>([])
  const [savingProfile, setSavingProfile] = useState(false)

  // Compute state
  const [computing, setComputing] = useState(false)
  const [computeError, setComputeError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // ── Ingested-state refresh ──
  //
  // Pulls the cumulative server-side view (total events, date range, truck
  // count, file list). Called on mount, after every upload batch, and
  // after compute so the "Currently ingested" card always reflects DB
  // truth regardless of how many partial upload batches have landed.
  const refreshIngested = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/gps/stop-details/ingested-summary?assessmentId=${encodeURIComponent(assessmentId)}`,
      )
      if (res.ok) {
        const data: IngestedSummary = await res.json()
        setIngested(data)
      }
    } catch {
      // Non-fatal; card just stays stale.
    }
  }, [assessmentId])

  // ── Initial load: existing result + profiles + ingested state ──
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [resultRes, profileRes, ingestedRes] = await Promise.all([
          fetch(`/api/gps/utilization/latest?assessmentId=${encodeURIComponent(assessmentId)}`),
          fetch(`/api/gps/utilization/profile?assessmentId=${encodeURIComponent(assessmentId)}`),
          fetch(`/api/gps/stop-details/ingested-summary?assessmentId=${encodeURIComponent(assessmentId)}`),
        ])
        if (cancelled) return
        const resultData = resultRes.ok ? await resultRes.json() : { result: null }
        const profileData = profileRes.ok ? await profileRes.json() : { profiles: [] }
        const ingestedData: IngestedSummary = ingestedRes.ok
          ? await ingestedRes.json()
          : { totalEvents: 0, dateRange: null, distinctTrucks: 0, fileCount: 0, files: [] }
        setResult(resultData.result)
        setProfiles(profileData.profiles ?? [])
        setIngested(ingestedData)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [assessmentId])

  // ── File upload ──
  //
  // Vercel serverless request body limit is ~4.5MB. Each TrackUS export
  // is ~0.5-1.5MB, so a drag-drop of 10+ files easily exceeds the limit
  // and returns 413 from the platform (before our handler even runs).
  // Upload files ONE AT A TIME; cross-request MD5 dedup on the server
  // prevents accidental double-ingestion.
  //
  // Uploads always APPEND. Uploading a new month (e.g. February) will
  // not wipe an earlier month's data. Clearing an existing analysis is
  // an explicit action (separate button) to avoid silent data loss.
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setParsing(true)
    setParseError(null)
    setParseSummary(null)
    setParseProgress({ done: 0, total: fileArray.length })

    // Accumulate summaries across per-file calls; return the latest +
    // aggregated file counts/events so the UI reflects the full batch.
    let accumulated: ParseSummary | null = null
    let totalFilesAccepted = 0
    let totalFilesRejected = 0
    let totalEventsIngested = 0
    const aggregatedRejections: ParseSummary['rejections'] = []

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const f = fileArray[i]
        const fd = new FormData()
        fd.append('assessmentId', assessmentId)
        fd.append(`file0`, f)

        const res = await fetch(`/api/gps/stop-details/parse`, {
          method: 'POST',
          body: fd,
        })
        const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
        if (!res.ok) {
          const msg = isJson ? (await res.json()).error : `Parse failed at ${f.name} (${res.status})`
          setParseError(msg ?? `Parse failed at ${f.name}`)
          return
        }
        const data: ParseSummary = await res.json()
        accumulated = data
        totalFilesAccepted += data.filesAccepted
        totalFilesRejected += data.filesRejected
        totalEventsIngested += data.eventsIngested
        aggregatedRejections.push(...data.rejections)
        setParseProgress({ done: i + 1, total: fileArray.length })
      }

      if (!accumulated) {
        setParseError('No files processed')
        return
      }

      // The final accumulated summary reflects the server's view after
      // ALL batches have landed. Override the per-call aggregate counts
      // with our client-side totals so the UI shows the full picture.
      const finalSummary: ParseSummary = {
        ...accumulated,
        filesAccepted: totalFilesAccepted,
        filesRejected: totalFilesRejected,
        eventsIngested: totalEventsIngested,
        rejections: aggregatedRejections,
      }
      setParseSummary(finalSummary)

      // Auto-populate plant drafts from the LAST call's candidates (which
      // were computed against the full accumulated event set). Skip when
      // profiles already exist — the user has already confirmed clusters
      // in a prior session, and we don't want to overwrite their naming.
      if (profiles.length === 0) {
        const topPlants = accumulated.plantCandidates
          .filter(c => c.confidence === 'high')
          .slice(0, 2)
        setPlantDrafts(topPlants.map((c, i) => ({
          clusterKey: c.clusterKey,
          centroidLat: c.centroid.lat,
          centroidLon: c.centroid.lon,
          plantName: i === 0 ? 'Plant A' : 'Plant B',
          batchingMixers: 0,
        })))
      }

      // Refresh the cumulative-state card so the UI reflects new data
      // in the DB regardless of whether compute was re-run.
      await refreshIngested()

      // If profiles already exist, auto-run compute so the hero-card
      // updates to include the newly-ingested events. Without this the
      // user has to manually click "Compute utilization" again after
      // every new upload, which is easy to forget.
      if (profiles.length > 0) {
        try {
          setComputing(true)
          const computeRes = await fetch('/api/gps/utilization/compute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assessmentId }),
          })
          if (computeRes.ok) {
            const latestRes = await fetch(
              `/api/gps/utilization/latest?assessmentId=${encodeURIComponent(assessmentId)}`,
            )
            if (latestRes.ok) {
              const latestData = await latestRes.json()
              setResult(latestData.result)
            }
          }
        } finally {
          setComputing(false)
        }
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Parse failed')
    } finally {
      setParsing(false)
      setParseProgress(null)
    }
  }, [assessmentId, profiles, refreshIngested])

  // ── Save profile + compute ──
  const canCompute = plantDrafts.length >= 2
    && plantDrafts.every(p => p.plantName.trim().length > 0 && p.batchingMixers > 0)

  const handleCompute = useCallback(async () => {
    if (!canCompute) return
    setComputing(true)
    setComputeError(null)
    setSavingProfile(true)
    try {
      // 1. Save profiles
      const profileRes = await fetch('/api/gps/utilization/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          plants: plantDrafts.map(p => ({
            plant_slug: p.plantName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            plant_name: p.plantName,
            centroid_lat: p.centroidLat,
            centroid_lon: p.centroidLon,
            centroid_source: 'verified',
            batching_mixer_count: p.batchingMixers,
            batching_mixer_count_source: 'verified',
          })),
        }),
      })
      if (!profileRes.ok) {
        const body = await profileRes.json().catch(() => ({}))
        setComputeError(body.error ?? 'Profile save failed')
        return
      }
      setSavingProfile(false)

      // 2. Run compute
      const computeRes = await fetch('/api/gps/utilization/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId }),
      })
      if (!computeRes.ok) {
        const body = await computeRes.json().catch(() => ({}))
        setComputeError(body.error ?? 'Compute failed')
        return
      }

      // 3. Reload latest result + refresh ingested state
      const [latestRes] = await Promise.all([
        fetch(`/api/gps/utilization/latest?assessmentId=${encodeURIComponent(assessmentId)}`),
        refreshIngested(),
      ])
      if (latestRes.ok) {
        const latestData = await latestRes.json()
        setResult(latestData.result)
      }
    } catch (e) {
      setComputeError(e instanceof Error ? e.message : 'Compute failed')
    } finally {
      setComputing(false)
      setSavingProfile(false)
    }
  }, [assessmentId, canCompute, plantDrafts, refreshIngested])

  // ── Render ──
  const padding = isMobile ? 'clamp(12px, 3vw, 16px)' : 'clamp(16px, 3vw, 24px)'

  if (loading) {
    return <div style={{ padding, color: '#888' }}>Loading utilization analysis…</div>
  }

  return (
    <div style={{
      padding, maxWidth: '1000px', margin: '0 auto', minWidth: 0,
      display: 'flex', flexDirection: 'column', gap: '20px',
    }}>
      {result && <HeroCard result={result} />}

      {ingested && ingested.totalEvents > 0 && (
        <IngestedSummaryCard ingested={ingested} result={result} />
      )}

      <UploadZone
        dragging={dragging}
        setDragging={setDragging}
        parsing={parsing}
        parseProgress={parseProgress}
        fileInputRef={fileInputRef}
        onFiles={handleFiles}
        isMobile={isMobile}
      />

      {parseError && (
        <div style={alertStyle('error')}>{parseError}</div>
      )}

      {parseSummary && (
        <ParseSummaryCard summary={parseSummary} />
      )}

      {plantDrafts.length > 0 && (
        <PlantConfirmCard
          drafts={plantDrafts}
          onChange={setPlantDrafts}
          onCompute={handleCompute}
          canCompute={canCompute}
          computing={computing || savingProfile}
        />
      )}

      {computeError && (
        <div style={alertStyle('error')}>{computeError}</div>
      )}

      {!result && !parseSummary && !parsing && (
        <EmptyStateTips />
      )}
    </div>
  )
}

// ── Hero card ────────────────────────────────────────────────────────────

function HeroCard({ result }: { result: UtilizationResult }) {
  const isMobile = useIsMobile()
  const value = result.monthly_value_usd ?? 0
  const gap = result.gap_loads_per_op_day ?? 0
  const current = result.current_loads_per_op_day ?? 0
  const demonstrated = result.demonstrated_loads_per_op_day ?? 0

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0F6E56 0%, #0A4F3F 100%)',
      color: '#fff',
      borderRadius: '12px',
      padding: 'clamp(20px, 4vw, 32px)',
      display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.8px',
                    textTransform: 'uppercase', opacity: 0.8 }}>
        Observed gap vs demonstrated capacity
      </div>
      <div style={{ fontSize: isMobile ? '36px' : '48px', fontWeight: 700, lineHeight: 1 }}>
        ${formatK(value)}<span style={{ fontSize: '0.5em', opacity: 0.8 }}> / month</span>
      </div>
      <div style={{ fontSize: '13px', opacity: 0.9, lineHeight: 1.5 }}>
        Current fleet averages <strong>{current.toFixed(0)} loads/day</strong>.
        Best-two operating weeks averaged <strong>{demonstrated.toFixed(0)} loads/day</strong>.
        The gap of <strong>{gap.toFixed(1)} loads/day</strong> represents this monthly margin.
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: '12px', marginTop: '8px',
      }}>
        <HeroMetric
          label="Current"
          value={`${current.toFixed(0)} /day`}
          description="Rolling average across the whole window. What the fleet is actually delivering today."
        />
        <HeroMetric
          label="Demonstrated"
          value={`${demonstrated.toFixed(0)} /day`}
          description="Average of the two best operating weeks in the window. A self-benchmark the plant has already proven."
        />
        <HeroMetric
          label="Peak week"
          value={result.peak_loads_per_op_day != null ? `${result.peak_loads_per_op_day.toFixed(0)} /day` : '—'}
          description="Single highest operating week. Aspirational upper bound, not the working target."
        />
        <HeroMetric
          label="Operating days"
          value={`${result.operating_days}`}
          description="Calendar days in the window minus Fridays and days with unusually low activity."
        />
      </div>

      <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
        Window: {result.window_start} → {result.window_end} · {result.trucks_in_scope} mixer-trucks in-scope
        {result.trucks_outlier > 0 && ` · ${result.trucks_outlier} outlier(s) flagged`}
      </div>
    </div>
  )
}

function HeroMetric({
  label, value, description,
}: {
  label: string
  value: string
  description?: string
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.08)',
      borderRadius: '8px',
      padding: '10px 12px',
      minWidth: 0,
      display: 'flex', flexDirection: 'column', gap: '2px',
    }}>
      <div style={{ fontSize: '10px', opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div>
      {description && (
        <div style={{ fontSize: '10px', opacity: 0.75, lineHeight: 1.4, marginTop: '4px' }}>
          {description}
        </div>
      )}
    </div>
  )
}

// ── Upload zone ──────────────────────────────────────────────────────────

function UploadZone({
  dragging, setDragging, parsing, parseProgress, fileInputRef, onFiles, isMobile,
}: {
  dragging: boolean
  setDragging: (b: boolean) => void
  parsing: boolean
  parseProgress: { done: number; total: number } | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFiles: (files: FileList | File[]) => void
  isMobile: boolean
}) {
  return (
    <div
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files)
      }}
      onClick={() => !parsing && fileInputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#0F6E56' : '#cbd5e1'}`,
        borderRadius: '12px',
        padding: isMobile ? '24px 16px' : '32px 20px',
        textAlign: 'center',
        background: dragging ? '#ECFDF5' : '#f8fafc',
        cursor: parsing ? 'not-allowed' : 'pointer',
        opacity: parsing ? 0.6 : 1,
        minHeight: '44px',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xls,.xlsx"
        onChange={e => {
          if (e.target.files) onFiles(e.target.files)
          e.target.value = ''
        }}
        style={{ display: 'none' }}
      />
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a', marginBottom: '6px' }}>
        {parsing && parseProgress
          ? `Parsing file ${parseProgress.done + 1} of ${parseProgress.total}…`
          : parsing
          ? 'Parsing files…'
          : 'Drop TrackUS Stop Details files here'}
      </div>
      <div style={{ fontSize: '12px', color: '#64748b' }}>
        Multi-file upload · .xls only · per-file validation + Riyadh filter
      </div>
    </div>
  )
}

// ── Ingested summary card (cumulative server state) ─────────────────────

function IngestedSummaryCard({
  ingested, result,
}: {
  ingested: IngestedSummary
  result: UtilizationResult | null
}) {
  // Stale hint: if a result exists and the ingested date range extends
  // beyond the result's computed window, the hero is out of date.
  const stale = result && ingested.dateRange
    ? ingested.dateRange.end > result.window_end
      || ingested.dateRange.start < result.window_start
    : false

  return (
    <div style={{
      border: '1px solid #CDE4DA',
      borderRadius: '10px',
      padding: '14px 16px',
      background: '#F4FAF7',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Currently ingested
      </div>
      <div style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.5 }}>
        <strong>{ingested.fileCount}</strong> batches
        {' · '}
        <strong>{ingested.totalEvents.toLocaleString()}</strong> events
        {' · '}
        <strong>{ingested.distinctTrucks}</strong> distinct trucks
        {ingested.dateRange && (
          <>
            {' · '}
            <strong>{ingested.dateRange.start} → {ingested.dateRange.end}</strong>
          </>
        )}
      </div>
      {stale && (
        <div style={{
          fontSize: '12px', color: '#7a5a00', background: '#FFF4D6',
          border: '1px solid #F1D79A', borderRadius: '6px',
          padding: '6px 10px',
        }}>
          Hero-card window is older than the ingested data. Click
          {' '}<em>Save profile + compute utilization</em> below to refresh.
        </div>
      )}
      {ingested.files.length > 0 && ingested.files.length <= 12 && (
        <details style={{ fontSize: '11px', color: '#64748b' }}>
          <summary style={{ cursor: 'pointer' }}>Show batches</summary>
          <ul style={{ margin: '6px 0 0 0', padding: '0 0 0 18px' }}>
            {ingested.files.map((f, i) => (
              <li key={i} style={{ lineHeight: 1.5 }}>
                {f.filename} — {f.eventsCount.toLocaleString()} events
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// ── Parse summary card ──────────────────────────────────────────────────

function ParseSummaryCard({ summary }: { summary: ParseSummary }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      padding: '16px',
      background: '#fff',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Latest batch
      </div>
      <div style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.5 }}>
        <strong>{summary.filesAccepted}</strong> files accepted
        {summary.filesRejected > 0 && <> · <strong>{summary.filesRejected}</strong> rejected</>}
        {' · '}
        <strong>{summary.eventsIngested.toLocaleString()}</strong> events ingested
        {' · '}
        <strong>{summary.trucksInScope}</strong> in-scope mixer-trucks
        {summary.trucksOutOfScope > 0 && <> · {summary.trucksOutOfScope} out-of-scope (filtered)</>}
      </div>
      <div style={{ fontSize: '11px', color: '#64748b' }}>
        This is only what just landed. See the cumulative total above.
      </div>
      {summary.rejections.length > 0 && (
        <div style={{ fontSize: '12px', color: '#8B3A2E' }}>
          Rejected: {summary.rejections.map(r => `${r.filename} (${r.reason})`).join(', ')}
        </div>
      )}
      {summary.outlierProfiles.length > 0 && (
        <div style={{
          borderTop: '1px solid #f1f5f9', paddingTop: '10px',
          fontSize: '12px', color: '#64748b', lineHeight: 1.5,
        }}>
          <strong style={{ color: '#B7950B' }}>Outlier attention:</strong>{' '}
          {summary.outlierProfiles.map(o => `${o.truckId} — ${o.note}`).join(' · ')}
        </div>
      )}
    </div>
  )
}

// ── Plant confirmation card ─────────────────────────────────────────────

function PlantConfirmCard({
  drafts, onChange, onCompute, canCompute, computing,
}: {
  drafts: PlantDraft[]
  onChange: (next: PlantDraft[]) => void
  onCompute: () => void
  canCompute: boolean
  computing: boolean
}) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      padding: '16px',
      background: '#fff',
      display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Confirm plants + enter mixer counts
      </div>
      <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
        Top-2 clusters auto-detected. Give each a name (e.g. Malham, Derab) and
        enter how many batching mixer units that plant has.
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '12px',
      }}>
        {drafts.map((d, i) => (
          <div key={d.clusterKey} style={{
            border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
              Cluster {d.clusterKey} · ({d.centroidLat.toFixed(4)}, {d.centroidLon.toFixed(4)})
            </div>
            <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
              Plant name
              <input
                type="text"
                value={d.plantName}
                onChange={e => {
                  const next = [...drafts]
                  next[i] = { ...d, plantName: e.target.value }
                  onChange(next)
                }}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
              Batching mixer units
              <input
                type="number"
                min={1}
                value={d.batchingMixers || ''}
                onChange={e => {
                  const next = [...drafts]
                  next[i] = { ...d, batchingMixers: Number(e.target.value) }
                  onChange(next)
                }}
                placeholder="e.g. 2"
                style={inputStyle}
              />
            </label>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onCompute}
        disabled={!canCompute || computing}
        style={{
          padding: '10px 16px',
          background: canCompute && !computing ? '#0F6E56' : '#94a3b8',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: canCompute && !computing ? 'pointer' : 'not-allowed',
          minHeight: '44px',
        }}
      >
        {computing ? 'Computing…' : 'Save profile + compute utilization'}
      </button>
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────

function EmptyStateTips() {
  return (
    <div style={{
      padding: '20px',
      background: '#f8fafc',
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      fontSize: '13px',
      color: '#64748b',
      lineHeight: 1.6,
    }}>
      <strong style={{ color: '#1a1a1a' }}>No utilization analysis yet.</strong>
      <br />
      Upload TrackUS Stop Details exports above. The platform will:
      <ol style={{ paddingInlineStart: '20px', marginTop: '6px' }}>
        <li>Validate each file (MD5 dedup, period match, out-of-bounds events)</li>
        <li>Filter to Riyadh-scope trucks; surface any outliers</li>
        <li>Auto-detect plant coordinates from the data</li>
        <li>Let you confirm plant names + mixer counts</li>
        <li>Compute current vs demonstrated capacity gap + monthly margin impact</li>
      </ol>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatK(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (abs >= 1_000) return Math.round(n / 1_000).toLocaleString() + 'K'
  return Math.round(n).toLocaleString()
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  marginTop: '4px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: 'inherit',
  minHeight: '36px',
}

function alertStyle(tone: 'error' | 'warning' | 'info'): React.CSSProperties {
  const palette = tone === 'error'
    ? { bg: '#FDEDEC', border: '#E8A39B', color: '#8B3A2E' }
    : tone === 'warning'
    ? { bg: '#FFF4D6', border: '#F1D79A', color: '#7a5a00' }
    : { bg: '#E1F5EE', border: '#A8D9C5', color: '#0F6E56' }
  return {
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: palette.color,
    lineHeight: 1.5,
  }
}
