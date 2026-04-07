'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Plant { id: string; name: string }
interface Customer { id: string; name: string; country: string; plants: Plant[] }

export default function NewAssessmentForm({
  customers,
  userId,
  baselineId,
  baselinePlant,
}: {
  customers: Customer[]
  userId: string
  baselineId?: string
  baselinePlant?: { id: string; name: string; customer_id: string; country: string } | null
}) {
  const isFollowup = !!baselineId
  const [customerId, setCustomerId] = useState('')
  const [plantId, setPlantId] = useState('')
  const [newPlantName, setNewPlantName] = useState('')
  const [addingPlant, setAddingPlant] = useState(false)
  const [season, setSeason] = useState<'peak' | 'summer'>('peak')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const selectedCustomer = customers.find(c => c.id === customerId)
  const plants = selectedCustomer?.plants || []

  const inp = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '14px', fontFamily: 'var(--font)',
    outline: 'none', background: 'var(--white)', color: 'var(--gray-900)'
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Follow-up path
    if (isFollowup && baselinePlant) {
      const resp = await fetch('/api/admin/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plant_id: baselinePlant.id,
          analyst_id: userId,
          date,
          season,
          phase: 'followup',
          baseline_id: baselineId,
          is_followup: true,
        }),
      })
      const json = await resp.json()
      if (!resp.ok) {
        setError(json.error || 'Failed to create follow-up assessment')
        setLoading(false)
        return
      }
      router.push(`/dashboard/assess/${json.assessment.id}`)
      return
    }

    // New assessment path
    const resp = await fetch('/api/admin/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(addingPlant && newPlantName
          ? { new_plant: { customer_id: customerId, name: newPlantName, country: selectedCustomer?.country || '' } }
          : { plant_id: plantId }),
        analyst_id: userId,
        date,
        season,
        phase: 'workshop',
      }),
    })
    const json = await resp.json()
    if (!resp.ok) {
      setError(json.error || 'Failed to create assessment')
      setLoading(false)
      return
    }

    router.push(`/dashboard/assess/${json.assessment.id}`)
  }

  // Follow-up form: simplified layout showing plant name read-only
  if (isFollowup && baselinePlant) {
    return (
      <form onSubmit={handleStart} style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginBottom: '4px' }}>Plant</div>
          <div style={{ fontSize: '14px', fontWeight: 500 }}>{baselinePlant.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{baselinePlant.country}</div>
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
            Follow-up date
          </label>
          <input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {error && <div style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
        <button type="submit" disabled={loading} style={{
          padding: '12px', background: 'var(--green)', color: '#fff',
          border: 'none', borderRadius: '8px', fontSize: '14px',
          fontWeight: '500', cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
          {loading ? 'Starting…' : 'Start follow-up →'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleStart} style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '24px',
      display: 'flex', flexDirection: 'column', gap: '16px'
    }}>
      {/* Customer */}
      <div>
        <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
          Customer *
        </label>
        {customers.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            No customers yet. <a href="/dashboard/customers" style={{ color: 'var(--green)' }}>Add a customer first →</a>
          </div>
        ) : (
          <select style={inp} value={customerId} onChange={e => { setCustomerId(e.target.value); setPlantId(''); setAddingPlant(false) }} required>
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Plant */}
      {customerId && (
        <div>
          <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
            Plant *
          </label>
          {!addingPlant ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <select style={{ ...inp, flex: 1 }} value={plantId} onChange={e => setPlantId(e.target.value)}>
                <option value="">Select plant…</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button type="button" onClick={() => { setAddingPlant(true); setPlantId('') }} style={{
                padding: '10px 14px', background: 'none', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                color: 'var(--green)', fontFamily: 'var(--font)', whiteSpace: 'nowrap'
              }}>
                + New plant
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={{ ...inp, flex: 1 }} value={newPlantName} onChange={e => setNewPlantName(e.target.value)}
                placeholder="Plant name, e.g. Riyadh North" autoFocus />
              <button type="button" onClick={() => { setAddingPlant(false); setNewPlantName('') }} style={{
                padding: '10px 14px', background: 'none', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                color: 'var(--gray-500)', fontFamily: 'var(--font)'
              }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Date & Season */}
      {customerId && (plantId || (addingPlant && newPlantName)) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                Visit date
              </label>
              <input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
                Season
              </label>
              <select style={inp} value={season} onChange={e => setSeason(e.target.value as 'peak' | 'summer')}>
                <option value="peak">Peak season (Sep–May)</option>
                <option value="summer">Summer (Jun–Aug)</option>
              </select>
            </div>
          </div>

          {error && <div style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</div>}

          <button type="submit" disabled={loading} style={{
            padding: '12px', background: 'var(--green)', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '14px',
            fontWeight: '500', cursor: 'pointer', fontFamily: 'var(--font)',
            marginTop: '4px'
          }}>
            {loading ? 'Starting…' : 'Start assessment →'}
          </button>
        </>
      )}
    </form>
  )
}
