'use client'

/**
 * Single-trip timer view, optimised for iPhone one-handed use.
 *
 * Layout (portrait, vertically stacked):
 *   - Header: label + close (×) button
 *   - Total elapsed (big mono), Stage elapsed (medium)
 *   - Current stage name + hint
 *   - Giant green split button (primary action)
 *   - Stage timeline (compact row of 7 dots, filled so far)
 *   - Identity fields (truck, driver, site) collapsible
 *   - Notes (collapsible)
 *   - Secondary actions (save partial, cancel)
 */

import { useState } from 'react'
import type { ActiveTrip, StageName } from '@/lib/fieldlog/offline-trip-queue'
import { STAGES } from '@/lib/fieldlog/offline-trip-queue'
import { STAGE_LABELS, STAGE_HINTS, NEXT_ACTION_LABEL } from './StageNames'
import { useStopwatch } from '@/hooks/useStopwatch'

interface LiveTripCardProps {
  trip: ActiveTrip
  measurers: string[]
  recentTrucks: string[]
  recentDrivers: string[]
  recentSites: string[]
  onSplit: (tripId: string) => void
  onSavePartial: (tripId: string) => void
  onCancel: (tripId: string) => void
  onClose: () => void
  onUpdateIdentity: (tripId: string, ids: { truckId?: string; driverName?: string; siteName?: string }) => void
  onUpdateNotes: (tripId: string, notes: string) => void
  onUpdateStageNote: (tripId: string, stage: StageName, text: string) => void
}

export default function LiveTripCard({
  trip,
  recentTrucks,
  recentDrivers,
  recentSites,
  onSplit,
  onSavePartial,
  onCancel,
  onClose,
  onUpdateIdentity,
  onUpdateNotes,
  onUpdateStageNote,
}: LiveTripCardProps) {
  const { totalElapsed, stageElapsed } = useStopwatch(trip)
  const [showIdentity, setShowIdentity] = useState(!trip.truckId)
  const [showNotes, setShowNotes] = useState(false)
  const [showStageNote, setShowStageNote] = useState(false)

  const currentIndex = STAGES.indexOf(trip.currentStage)
  const stageLabel = STAGE_LABELS[trip.currentStage]
  const stageHint = STAGE_HINTS[trip.currentStage]
  const splitLabel = NEXT_ACTION_LABEL[trip.currentStage]
  const isLastStage = currentIndex === STAGES.length - 1

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#fafafa', padding: '16px', gap: '14px',
      paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Active trip · {trip.measurerName}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginTop: '2px' }}>
            {trip.label}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            border: '1px solid #ddd', background: '#fff',
            fontSize: '20px', color: '#666', cursor: 'pointer',
          }}
          aria-label="Back to trip list"
        >←</button>
      </div>

      {/* Timers */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
        padding: '16px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>
          Total elapsed
        </div>
        <div style={{
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
          fontSize: '42px', fontWeight: 700, color: '#1a1a1a',
          marginTop: '4px', letterSpacing: '-1px',
        }}>
          {totalElapsed}
        </div>
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>
            {stageLabel}
          </div>
          <div style={{
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            fontSize: '28px', fontWeight: 600, color: '#0F6E56',
            marginTop: '2px',
          }}>
            {stageElapsed}
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
            {stageHint}
          </div>
        </div>
      </div>

      {/* Big split button */}
      <button
        type="button"
        onClick={() => onSplit(trip.id)}
        style={{
          width: '100%', minHeight: '72px',
          background: isLastStage ? '#C0392B' : '#0F6E56', color: '#fff',
          border: 'none', borderRadius: '14px',
          fontSize: '18px', fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(15, 110, 86, 0.25)',
          padding: '0 20px',
        }}
      >
        {splitLabel}
      </button>

      {/* Stage timeline */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
        {STAGES.map((s, i) => {
          const done = i < currentIndex
          const current = i === currentIndex
          return (
            <div key={s} style={{
              flex: 1, height: '6px', borderRadius: '3px',
              background: done ? '#0F6E56' : current ? '#5AAE93' : '#e0e0e0',
            }} />
          )
        })}
      </div>
      <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginTop: '-8px' }}>
        Stage {currentIndex + 1} of {STAGES.length}
      </div>

      {/* Identity (collapsible) */}
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px' }}>
        <button
          type="button"
          onClick={() => setShowIdentity(v => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', padding: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '13px', fontWeight: 600, color: '#555', cursor: 'pointer',
          }}
        >
          <span>Truck · Driver · Site</span>
          <span style={{ fontSize: '10px', color: '#888' }}>{showIdentity ? '▲' : '▼'}</span>
        </button>
        {showIdentity && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <InputWithAutocomplete
              label="Truck ID"
              value={trip.truckId ?? ''}
              suggestions={recentTrucks}
              onChange={(v) => onUpdateIdentity(trip.id, { truckId: v })}
              placeholder="TR-14, 42, etc."
            />
            <InputWithAutocomplete
              label="Driver"
              value={trip.driverName ?? ''}
              suggestions={recentDrivers}
              onChange={(v) => onUpdateIdentity(trip.id, { driverName: v })}
              placeholder="Name"
            />
            <InputWithAutocomplete
              label="Site"
              value={trip.siteName ?? ''}
              suggestions={recentSites}
              onChange={(v) => onUpdateIdentity(trip.id, { siteName: v })}
              placeholder="Site name"
            />
          </div>
        )}
      </div>

      {/* Stage-specific note */}
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px' }}>
        <button
          type="button"
          onClick={() => setShowStageNote(v => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', padding: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '13px', fontWeight: 600, color: '#555', cursor: 'pointer',
          }}
        >
          <span>Note on {stageLabel.toLowerCase()}</span>
          <span style={{ fontSize: '10px', color: '#888' }}>{showStageNote ? '▲' : '▼'}</span>
        </button>
        {showStageNote && (
          <textarea
            value={trip.stageNotes[trip.currentStage] ?? ''}
            onChange={(e) => onUpdateStageNote(trip.id, trip.currentStage, e.target.value)}
            placeholder={`What happened during ${stageLabel.toLowerCase()}?`}
            rows={2}
            style={{
              width: '100%', marginTop: '10px', padding: '10px',
              border: '1px solid #e0e0e0', borderRadius: '8px',
              fontSize: '14px', fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        )}
      </div>

      {/* Trip-level notes */}
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px' }}>
        <button
          type="button"
          onClick={() => setShowNotes(v => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', padding: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '13px', fontWeight: 600, color: '#555', cursor: 'pointer',
          }}
        >
          <span>Trip notes</span>
          <span style={{ fontSize: '10px', color: '#888' }}>{showNotes ? '▲' : '▼'}</span>
        </button>
        {showNotes && (
          <textarea
            value={trip.notes}
            onChange={(e) => onUpdateNotes(trip.id, e.target.value)}
            placeholder="General observations about this trip"
            rows={3}
            style={{
              width: '100%', marginTop: '10px', padding: '10px',
              border: '1px solid #e0e0e0', borderRadius: '8px',
              fontSize: '14px', fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        )}
      </div>

      {/* Secondary actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button
          type="button"
          onClick={() => {
            if (confirm('Save this trip as partial? Missing stages will be marked incomplete.')) {
              onSavePartial(trip.id)
            }
          }}
          style={{
            flex: 1, minHeight: '48px',
            background: '#fff', color: '#7a5a00',
            border: '1px solid #D68910', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Save partial
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm('Discard this trip? Data cannot be recovered.')) {
              onCancel(trip.id)
            }
          }}
          style={{
            flex: 1, minHeight: '48px',
            background: '#fff', color: '#C0392B',
            border: '1px solid #C0392B', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Autocomplete input ──────────────────────────────────────────────────
function InputWithAutocomplete({
  label, value, suggestions, onChange, placeholder,
}: {
  label: string
  value: string
  suggestions: string[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  const filtered = value
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 5)
    : suggestions.slice(0, 5)
  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 600 }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        style={{
          width: '100%', minHeight: '44px', padding: '8px 12px',
          border: '1px solid #ddd', borderRadius: '8px',
          fontSize: '15px', fontFamily: 'inherit',
        }}
      />
      {focused && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: '4px', background: '#fff', border: '1px solid #ddd',
          borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
          zIndex: 10, maxHeight: '200px', overflowY: 'auto',
        }}>
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={() => onChange(s)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px', border: 'none', background: 'none',
                fontSize: '14px', color: '#333', cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
              }}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}
