'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ManualEntryFormProps {
  assessmentId: string
  plantId: string
  logDate: string
  onSaved: () => void
  existingTruckIds: string[]
  existingDriverNames: string[]
  existingSiteNames: string[]
  tripCount: number
}

export default function ManualEntryForm({
  assessmentId, plantId, logDate, onSaved,
  existingTruckIds, existingDriverNames, existingSiteNames, tripCount,
}: ManualEntryFormProps) {
  const supabase = createClient()

  const [truckId, setTruckId] = useState('')
  const [driverName, setDriverName] = useState('')
  const [siteName, setSiteName] = useState('')
  const [siteType, setSiteType] = useState<string>('')
  // 9-stage timestamps
  const [plantQueueStart, setPlantQueueStart] = useState('')
  const [loadingStart, setLoadingStart] = useState('')
  const [loadingEnd, setLoadingEnd] = useState('')         // weighbridge start
  const [departureLoaded, setDepartureLoaded] = useState('')
  const [arrivalSite, setArrivalSite] = useState('')
  const [dischargeStart, setDischargeStart] = useState('')
  const [dischargeEnd, setDischargeEnd] = useState('')
  const [departureSite, setDepartureSite] = useState('')
  const [arrivalPlant, setArrivalPlant] = useState('')
  const [plantPrepEnd, setPlantPrepEnd] = useState('')     // truck ready for next load
  const [slumpPass, setSlumpPass] = useState<string>('')
  const [slumpTestTime, setSlumpTestTime] = useState('')
  const [slumpTestLocation, setSlumpTestLocation] = useState<'' | 'plant' | 'site'>('')
  const [loadM3, setLoadM3] = useState('')
  const [rejected, setRejected] = useState(false)
  const [rejectSide, setRejectSide] = useState('')
  const [rejectCause, setRejectCause] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function timeToTimestamp(time: string): string | null {
    if (!time) return null
    return `${logDate}T${time}:00`
  }

  function clearForm(keepTruck: boolean) {
    if (!keepTruck) setTruckId('')
    setDriverName('')
    setSiteName('')
    setSiteType('')
    setPlantQueueStart('')
    setLoadingStart('')
    setLoadingEnd('')
    setDepartureLoaded('')
    setArrivalSite('')
    setDischargeStart('')
    setDischargeEnd('')
    setDepartureSite('')
    setArrivalPlant('')
    setPlantPrepEnd('')
    setSlumpPass('')
    setSlumpTestTime('')
    setSlumpTestLocation('')
    setLoadM3('')
    setRejected(false)
    setRejectSide('')
    setRejectCause('')
    setNotes('')
    setError('')
  }

  const save = useCallback(async (andNew: boolean) => {
    if (!departureLoaded) {
      setError('Departure time is required')
      return
    }
    setSaving(true)
    setError('')

    const row = {
      assessment_id: assessmentId,
      plant_id: plantId,
      log_date: logDate,
      truck_id: truckId || null,
      driver_name: driverName || null,
      site_name: siteName || null,
      site_type: siteType || null,
      // 9-stage cycle timestamps (all optional; NULL → stage not measured)
      plant_queue_start: timeToTimestamp(plantQueueStart),
      loading_start: timeToTimestamp(loadingStart),
      loading_end: timeToTimestamp(loadingEnd),
      departure_loaded: timeToTimestamp(departureLoaded),
      arrival_site: timeToTimestamp(arrivalSite),
      discharge_start: timeToTimestamp(dischargeStart),
      discharge_end: timeToTimestamp(dischargeEnd),
      departure_site: timeToTimestamp(departureSite),
      arrival_plant: timeToTimestamp(arrivalPlant),
      plant_prep_end: timeToTimestamp(plantPrepEnd),
      // Slump test metadata
      slump_pass: slumpPass === 'pass' ? true : slumpPass === 'fail' ? false : null,
      slump_test_time: slumpTestTime ? timeToTimestamp(slumpTestTime) : null,
      slump_test_location: slumpTestLocation || null,
      load_m3: loadM3 ? parseFloat(loadM3) : null,
      rejected,
      reject_side: rejected && rejectSide ? rejectSide : null,
      reject_cause: rejected && rejectCause ? rejectCause : null,
      notes: notes || null,
      data_source: 'direct_observation',
    }

    const { error: dbErr } = await supabase.from('daily_logs').insert(row)
    setSaving(false)

    if (dbErr) {
      setError(dbErr.message)
      return
    }

    if (andNew) {
      clearForm(true)
    } else {
      clearForm(false)
    }
    onSaved()
  }, [assessmentId, plantId, logDate, truckId, driverName, siteName, siteType,
      plantQueueStart, loadingStart, loadingEnd, departureLoaded, arrivalSite,
      dischargeStart, dischargeEnd, departureSite, arrivalPlant, plantPrepEnd,
      slumpPass, slumpTestTime, slumpTestLocation,
      loadM3, rejected, rejectSide, rejectCause, notes, supabase, onSaved])

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 11px', border: '1px solid var(--gray-300, #d1d5db)',
    borderRadius: '8px', fontSize: '15px', background: '#fff', color: '#1a1a1a',
    boxSizing: 'border-box',
  }
  const timeStyle: React.CSSProperties = { ...inputStyle, width: '140px' }
  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase' as const,
    letterSpacing: '.04em', marginBottom: '4px', display: 'block',
  }
  const rowStyle: React.CSSProperties = { marginBottom: '14px' }

  return (
    <div style={{ maxWidth: '500px' }}>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px', fontWeight: 500 }}>
        Trip #{tripCount + 1} today
      </div>

      {/* Truck + Driver */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', ...rowStyle }}>
        <div>
          <label style={labelStyle}>Truck ID</label>
          <input value={truckId} onChange={e => setTruckId(e.target.value)}
            list="truck-ids" placeholder="e.g. T-14" style={inputStyle} />
          <datalist id="truck-ids">
            {existingTruckIds.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div>
          <label style={labelStyle}>Driver</label>
          <input value={driverName} onChange={e => setDriverName(e.target.value)}
            list="driver-names" placeholder="Optional" style={inputStyle} />
          <datalist id="driver-names">
            {existingDriverNames.map(d => <option key={d} value={d} />)}
          </datalist>
        </div>
      </div>

      {/* Site */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', ...rowStyle }}>
        <div>
          <label style={labelStyle}>Site name</label>
          <input value={siteName} onChange={e => setSiteName(e.target.value)}
            list="site-names" placeholder="e.g. Al Hamra Tower" style={inputStyle} />
          <datalist id="site-names">
            {existingSiteNames.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label style={labelStyle}>Site type</label>
          <select value={siteType} onChange={e => setSiteType(e.target.value)} style={inputStyle}>
            <option value="">Select</option>
            <option value="ground_pour">Ground pour</option>
            <option value="high_rise">High-rise</option>
            <option value="infrastructure">Infrastructure</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </div>

      {/* 9-stage cycle timestamps (all optional; departure_loaded required
          as the single mandatory anchor so we can slot the trip into the day). */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: '14px', marginTop: '6px', ...rowStyle }}>
        <label style={{ ...labelStyle, marginBottom: '10px' }}>Cycle timestamps</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Plant queue start</label>
            <input type="time" value={plantQueueStart} onChange={e => setPlantQueueStart(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Loading start</label>
            <input type="time" value={loadingStart} onChange={e => setLoadingStart(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Loading end (at weighbridge)</label>
            <input type="time" value={loadingEnd} onChange={e => setLoadingEnd(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Departure loaded *</label>
            <input type="time" value={departureLoaded} onChange={e => setDepartureLoaded(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Arrival site</label>
            <input type="time" value={arrivalSite} onChange={e => setArrivalSite(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Discharge start</label>
            <input type="time" value={dischargeStart} onChange={e => setDischargeStart(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Discharge end</label>
            <input type="time" value={dischargeEnd} onChange={e => setDischargeEnd(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Departure site</label>
            <input type="time" value={departureSite} onChange={e => setDepartureSite(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Arrival plant</label>
            <input type="time" value={arrivalPlant} onChange={e => setArrivalPlant(e.target.value)} style={timeStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Ready for next load</label>
            <input type="time" value={plantPrepEnd} onChange={e => setPlantPrepEnd(e.target.value)} style={timeStyle} />
          </div>
        </div>
      </div>

      {/* Slump test (optional) */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: '14px', marginTop: '6px', ...rowStyle }}>
        <label style={{ ...labelStyle, marginBottom: '10px' }}>Slump test (optional)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Location</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[{ v: 'plant', l: 'Plant' }, { v: 'site', l: 'Site' }, { v: '', l: 'N/A' }].map(o => (
                <button key={o.v} type="button" onClick={() => setSlumpTestLocation(o.v as '' | 'plant' | 'site')}
                  style={{
                    padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                    border: `1.5px solid ${slumpTestLocation === o.v ? '#0F6E56' : '#d1d5db'}`,
                    background: slumpTestLocation === o.v ? '#e8f5ee' : '#fff',
                    color: slumpTestLocation === o.v ? '#0F6E56' : '#888',
                  }}>{o.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: '10px' }}>Time</label>
            <input type="time" value={slumpTestTime} onChange={e => setSlumpTestTime(e.target.value)} style={timeStyle} />
          </div>
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: '10px' }}>Result</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[{ v: 'pass', l: 'Pass' }, { v: 'fail', l: 'Fail' }, { v: '', l: 'Not tested' }].map(o => (
              <button key={o.v} type="button" onClick={() => setSlumpPass(o.v)}
                style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                  border: `1.5px solid ${slumpPass === o.v ? '#0F6E56' : '#d1d5db'}`,
                  background: slumpPass === o.v ? '#e8f5ee' : '#fff',
                  color: slumpPass === o.v ? '#0F6E56' : '#888',
                }}>{o.l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Load */}
      <div style={rowStyle}>
        <label style={labelStyle}>Load (m³)</label>
        <input type="number" step="0.1" min="0" max="15" value={loadM3}
          onChange={e => setLoadM3(e.target.value)} placeholder="e.g. 7.0" style={{ ...inputStyle, width: '140px' }} />
      </div>

      {/* Rejection */}
      <div style={rowStyle}>
        <label style={labelStyle}>Rejected?</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['No', 'Yes'].map(opt => (
            <button key={opt} type="button"
              onClick={() => { setRejected(opt === 'Yes'); if (opt === 'No') { setRejectSide(''); setRejectCause('') } }}
              style={{
                padding: '6px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                border: `1.5px solid ${(opt === 'Yes' ? rejected : !rejected) ? '#0F6E56' : '#d1d5db'}`,
                background: (opt === 'Yes' ? rejected : !rejected) ? '#e8f5ee' : '#fff',
                color: (opt === 'Yes' ? rejected : !rejected) ? '#0F6E56' : '#888',
              }}
            >{opt}</button>
          ))}
        </div>
        {rejected && (
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <label style={{ ...labelStyle, fontSize: '10px' }}>Reject side</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[{ v: 'plant_side', l: 'Plant' }, { v: 'customer_side', l: 'Customer/Site' }].map(o => (
                  <button key={o.v} type="button" onClick={() => setRejectSide(o.v)}
                    style={{
                      padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                      border: `1.5px solid ${rejectSide === o.v ? '#c0392b' : '#d1d5db'}`,
                      background: rejectSide === o.v ? '#fde8e6' : '#fff',
                      color: rejectSide === o.v ? '#c0392b' : '#888',
                    }}
                  >{o.l}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: '10px' }}>Cause</label>
              <input value={rejectCause} onChange={e => setRejectCause(e.target.value)}
                placeholder="e.g. slump loss, site not ready" style={inputStyle} />
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={rowStyle}>
        <label style={labelStyle}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Observations, delays, anything notable"
          rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      {/* Error */}
      {error && <div style={{ color: '#c0392b', fontSize: '13px', marginBottom: '10px' }}>{error}</div>}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button type="button" onClick={() => save(true)} disabled={saving}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: '#0F6E56', color: '#fff', fontSize: '14px', fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}>
          {saving ? 'Saving...' : 'Save & Next Trip'}
        </button>
        <button type="button" onClick={() => save(false)} disabled={saving}
          style={{
            padding: '10px 16px', borderRadius: '8px', border: '1px solid #d1d5db',
            background: '#fff', color: '#555', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            opacity: saving ? 0.6 : 1,
          }}>
          Save & Done
        </button>
      </div>
    </div>
  )
}
