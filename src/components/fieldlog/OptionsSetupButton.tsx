'use client'

/**
 * Admin "Setup options" entry in the Field Log overflow menu.
 *
 * Lets the admin pre-create the lists that the live timer pickers offer:
 *   - Origin plants (e.g. "Narjes", "Shifa")
 *   - Batching units, each tied to one origin plant
 *   - Mix / strength types (e.g. "350", "B40")
 *
 * Helpers using a /fc/[token] link see exactly these lists via the
 * get_field_capture_options RPC, with no "+" button. So this modal is the
 * single source of truth for what the helper can pick from.
 *
 * On first open for a fresh assessment, offers a one-tap seed of the 11
 * standard mix-type strengths the customer requested (sorted ascending).
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchOptionsForAssessment,
  upsertAssessmentOption,
  seedDefaultMixTypes,
  EMPTY_OPTIONS,
  type FieldCaptureOptions,
} from '@/lib/fieldlog/assessment-options'

interface Props {
  assessmentId: string
}

type Tab = 'mix_type' | 'origin_plant' | 'batching_unit'

export default function OptionsSetupButton({ assessmentId }: Props) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('mix_type')
  const [opts, setOpts] = useState<FieldCaptureOptions>(EMPTY_OPTIONS)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  // Form state for the "add new" row, kept per kind so switching tabs
  // does not clobber a half-typed entry.
  const [newMix, setNewMix] = useState('')
  const [newPlant, setNewPlant] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [unitParent, setUnitParent] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    const o = await fetchOptionsForAssessment(assessmentId)
    setOpts(o)
    if (o.origin_plants.length > 0 && !unitParent) {
      setUnitParent(o.origin_plants[0].name)
    }
    setLoading(false)
  }, [assessmentId, unitParent])

  useEffect(() => { if (open) reload() }, [open, reload])

  const addMix = async () => {
    const name = newMix.trim()
    if (!name) return
    setBusy(true)
    const numeric = Number(name)
    const sortValue = Number.isFinite(numeric) ? numeric : null
    await upsertAssessmentOption({
      assessmentId, kind: 'mix_type', name, sortValue,
    })
    setNewMix('')
    await reload()
    setBusy(false)
  }

  const addPlant = async () => {
    const name = newPlant.trim()
    if (!name) return
    setBusy(true)
    await upsertAssessmentOption({ assessmentId, kind: 'origin_plant', name })
    setNewPlant('')
    await reload()
    setBusy(false)
  }

  const addUnit = async () => {
    const name = newUnit.trim()
    if (!name || !unitParent) return
    setBusy(true)
    await upsertAssessmentOption({
      assessmentId, kind: 'batching_unit', name, parentName: unitParent,
    })
    setNewUnit('')
    await reload()
    setBusy(false)
  }

  const removeOption = async (kind: Tab, name: string, parent: string | null) => {
    if (!confirm(`Remove "${name}"?`)) return
    setBusy(true)
    let q = supabase.from('assessment_options').delete()
      .eq('assessment_id', assessmentId).eq('kind', kind).eq('name', name)
    if (parent) q = q.eq('parent_name', parent)
    else q = q.is('parent_name', null)
    await q
    await reload()
    setBusy(false)
  }

  const seedMix = async () => {
    setBusy(true)
    await seedDefaultMixTypes(assessmentId)
    await reload()
    setBusy(false)
  }

  const tabBtn = (key: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      style={{
        padding: '8px 12px', minHeight: '36px',
        background: tab === key ? '#0F6E56' : '#fff',
        color: tab === key ? '#fff' : '#555',
        border: `1px solid ${tab === key ? '#0F6E56' : '#d1d5db'}`,
        borderRadius: '8px', fontSize: '13px', fontWeight: 600,
        cursor: 'pointer',
      }}
    >{label}</button>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 14px',
          background: '#fff',
          border: '1px solid #0F6E56',
          color: '#0F6E56',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >Setup options</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', padding: '20px',
              width: '94%', maxWidth: '560px', maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Field Log setup</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                  These lists drive the live timer pickers. Helpers using a token link see exactly what you set up here.
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888', lineHeight: 1,
              }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
              {tabBtn('mix_type', `Mix types (${opts.mix_types.length})`)}
              {tabBtn('origin_plant', `Plants (${opts.origin_plants.length})`)}
              {tabBtn('batching_unit', `Units (${opts.batching_units.length})`)}
            </div>

            {loading && <div style={{ fontSize: '12px', color: '#888' }}>Loading...</div>}

            {!loading && tab === 'mix_type' && (
              <div>
                {opts.mix_types.length === 0 && (
                  <div style={{
                    background: '#FFF8E1', border: '1px solid #F1D79A',
                    borderRadius: '8px', padding: '10px 12px', marginBottom: '10px',
                    fontSize: '12px', color: '#7B5E10',
                  }}>
                    No mix types yet. Tap below to seed the 11 standard strengths
                    (250, 270, 350, 370, 400, 410, 420, 440, 470, 500, 550) sorted ascending.
                    <button
                      type="button"
                      onClick={seedMix}
                      disabled={busy}
                      style={{
                        marginInlineStart: '8px',
                        padding: '4px 10px', background: '#0F6E56', color: '#fff',
                        border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        cursor: busy ? 'wait' : 'pointer',
                      }}
                    >Seed defaults</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    value={newMix}
                    onChange={e => setNewMix(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addMix() }}
                    placeholder="e.g. 350, B40"
                    style={{ flex: 1, minHeight: '40px', padding: '0 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                  />
                  <button type="button" onClick={addMix} disabled={busy || !newMix.trim()} style={{
                    padding: '0 16px', background: '#0F6E56', color: '#fff', border: 'none',
                    borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}>Add</button>
                </div>
                {opts.mix_types.map(m => (
                  <div key={m.name} style={listRowStyle}>
                    <span>{m.name}</span>
                    <button type="button" onClick={() => removeOption('mix_type', m.name, null)} style={removeBtnStyle}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            {!loading && tab === 'origin_plant' && (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    value={newPlant}
                    onChange={e => setNewPlant(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addPlant() }}
                    placeholder="e.g. Narjes, Shifa"
                    style={{ flex: 1, minHeight: '40px', padding: '0 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                  />
                  <button type="button" onClick={addPlant} disabled={busy || !newPlant.trim()} style={{
                    padding: '0 16px', background: '#0F6E56', color: '#fff', border: 'none',
                    borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}>Add</button>
                </div>
                {opts.origin_plants.map(p => (
                  <div key={p.name} style={listRowStyle}>
                    <span>{p.name}</span>
                    <button type="button" onClick={() => removeOption('origin_plant', p.name, null)} style={removeBtnStyle}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            {!loading && tab === 'batching_unit' && (
              <div>
                {opts.origin_plants.length === 0 && (
                  <div style={{
                    background: '#FDEDEC', border: '1px solid #E8A39B',
                    borderRadius: '8px', padding: '10px 12px', marginBottom: '10px',
                    fontSize: '12px', color: '#8B3A2E',
                  }}>
                    Add at least one plant first. Each batching unit belongs to a plant.
                  </div>
                )}
                {opts.origin_plants.length > 0 && (
                  <>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <select
                        value={unitParent}
                        onChange={e => setUnitParent(e.target.value)}
                        style={{ minHeight: '40px', padding: '0 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
                      >
                        {opts.origin_plants.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                      </select>
                      <input
                        type="text"
                        value={newUnit}
                        onChange={e => setNewUnit(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addUnit() }}
                        placeholder="Unit 1, BU-A, etc."
                        style={{ flex: 1, minWidth: '160px', minHeight: '40px', padding: '0 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                      />
                      <button type="button" onClick={addUnit} disabled={busy || !newUnit.trim()} style={{
                        padding: '0 16px', background: '#0F6E56', color: '#fff', border: 'none',
                        borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                      }}>Add</button>
                    </div>
                    {opts.origin_plants.map(p => {
                      const units = opts.batching_units.filter(u => u.parent_name === p.name)
                      if (units.length === 0) return null
                      return (
                        <div key={p.name} style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
                            {p.name}
                          </div>
                          {units.map(u => (
                            <div key={`${p.name}::${u.name}`} style={listRowStyle}>
                              <span>{u.name}</span>
                              <button type="button" onClick={() => removeOption('batching_unit', u.name, p.name)} style={removeBtnStyle}>Remove</button>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const listRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 12px', border: '1px solid #e5e5e5', borderRadius: '8px',
  marginBottom: '6px', fontSize: '14px', background: '#fff',
}

const removeBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: '#fff', color: '#C0392B',
  border: '1px solid #E8A39B', borderRadius: '6px', fontSize: '11px',
  fontWeight: 600, cursor: 'pointer',
}
