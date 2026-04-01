'use client'

export type GpsStatus =
  | 'idle'
  | 'uploaded'
  | 'analyzing'
  | 'mapping_required'
  | 'processing'
  | 'complete'
  | 'failed'

const STATUS_CONFIG: Record<GpsStatus, { label: string; color: string; bg: string; border: string; icon: string }> = {
  idle:             { label: '',                            color: 'var(--gray-400)',      bg: 'transparent',          border: 'transparent',          icon: '' },
  uploaded:         { label: 'Uploaded',                    color: 'var(--phase-workshop)', bg: 'var(--info-bg)',       border: 'var(--info-border)',    icon: '📁' },
  analyzing:        { label: 'Analyzing format…',           color: 'var(--phase-onsite)',   bg: 'var(--warning-bg)',    border: 'var(--warning-border)', icon: '🔍' },
  mapping_required: { label: 'Ready to confirm columns',    color: 'var(--phase-onsite)',   bg: 'var(--warning-bg)',    border: 'var(--warning-border)', icon: '🗂️' },
  processing:       { label: 'Processing…',                 color: 'var(--phase-onsite)',   bg: 'var(--warning-bg)',    border: 'var(--warning-border)', icon: '⚙️' },
  complete:         { label: 'Complete',                    color: 'var(--phase-complete)', bg: 'var(--phase-complete-bg)', border: 'var(--tooltip-border)', icon: '✓' },
  failed:           { label: 'Failed',                      color: 'var(--red)',            bg: 'var(--error-bg)',      border: 'var(--error-border)',   icon: '⚠' },
}

interface ProcessingStatusProps {
  status: GpsStatus
  errorMessage?: string | null
  confidenceScore?: number | null
  tripsAnalyzed?: number | null
  trucksAnalyzed?: number | null
}

export default function ProcessingStatus({
  status,
  errorMessage,
  confidenceScore,
  tripsAnalyzed,
  trucksAnalyzed,
}: ProcessingStatusProps) {
  if (status === 'idle') return null

  const cfg = STATUS_CONFIG[status]

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '10px 14px', borderRadius: '8px',
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      fontSize: '13px', color: cfg.color,
    }}>
      {cfg.icon && (
        <span style={{ fontSize: '14px', lineHeight: '1.4', flexShrink: 0 }}>{cfg.icon}</span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontWeight: 500 }}>
          {status === 'analyzing' || status === 'processing' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '12px' }}>◌</span>
              {cfg.label}
            </span>
          ) : cfg.label}
        </span>

        {status === 'failed' && errorMessage && (
          <span style={{ fontSize: '12px', color: 'var(--gray-500)', fontWeight: 400 }}>
            {errorMessage}
          </span>
        )}

        {status === 'complete' && (
          <span style={{ fontSize: '12px', color: 'var(--gray-500)', fontWeight: 400 }}>
            {tripsAnalyzed !== null && tripsAnalyzed !== undefined
              ? `${tripsAnalyzed} trips analysed across ${trucksAnalyzed ?? '?'} trucks`
              : 'Analysis complete'}
            {confidenceScore !== null && confidenceScore !== undefined && (
              <> · Confidence: {Math.round(confidenceScore * 100)}%</>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
