// TODO: This file is deprecated. Replaced by ExportWord.tsx.
// Still imported by OwnerReportView.tsx for SummaryPDFButton.
// Safe to delete once OwnerReportView is migrated to ExportWord.
'use client'

import { useState, useRef, useCallback } from 'react'
import type { CalcResult, Answers } from '@/lib/calculations'
import { buildIssues, getFinancialBottleneck, type Issue } from '@/lib/issues'

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

function scoreColor(v: number | null): string {
  if (v === null) return 'var(--gray-300)'
  if (v >= 80) return 'var(--green)'
  if (v >= 60) return 'var(--warning-dark)'
  return 'var(--red)'
}

function scoreBg(v: number | null): string {
  if (v === null) return 'var(--gray-100)'
  if (v >= 80) return 'var(--green-light)'
  if (v >= 60) return 'var(--warning-bg)'
  return 'var(--error-bg)'
}

interface ExportPDFProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  recoveryRange?: { lo: number; hi: number } | null
  phase?: string
}

export default function ExportPDF({ calcResult, answers, meta, report, recoveryRange, phase }: ExportPDFProps) {
  const isPre = phase === 'workshop'
  const [exporting, setExporting] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const issues = buildIssues(calcResult, answers, meta)
  const financialBottleneck = getFinancialBottleneck(issues)
  const bottleneckIssues = issues.filter(i => i.category === 'bottleneck' && i.loss > 0)
  const bottleneckLoss = bottleneckIssues.length > 0 ? Math.max(...bottleneckIssues.map(i => i.loss)) : 0
  const independentLoss = issues.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
  const totalLoss = bottleneckLoss + independentLoss

  const handleExport = useCallback(async () => {
    if (!printRef.current) return
    setExporting(true)

    try {
      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')

      // Show the hidden print area
      printRef.current.style.display = 'block'

      // Wait for render
      await new Promise(r => setTimeout(r, 100))

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 800,
      })

      // Hide again
      printRef.current.style.display = 'none'

      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pdfWidth - 20 // 10mm margin each side
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      let y = 10
      let remainingHeight = imgHeight

      // First page
      pdf.addImage(imgData, 'JPEG', 10, y, imgWidth, imgHeight)

      // Add additional pages if content overflows
      while (remainingHeight > pdfHeight - 20) {
        remainingHeight -= (pdfHeight - 20)
        y -= (pdfHeight - 20)
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 10, y, imgWidth, imgHeight)
      }

      const plantName = meta?.plant || 'Assessment'
      const dateStr = meta?.date ? new Date(meta.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      pdf.save(`Al-RMX_${plantName.replace(/\s+/g, '_')}_${dateStr}.pdf`)
    } catch (e) {
      console.error('PDF export error:', e)
    }

    setExporting(false)
  }, [meta])

  // Dispatch is a mechanism within TAT, not a standalone KPI. Constraint uses recovery range label in pre-assessment.
  const kpis = [
    { label: 'Utilisation', value: calcResult.util ? `${Math.round(calcResult.util * 100)}%` : '-' },
    { label: 'Turnaround', value: calcResult.ta ? `${Math.round(calcResult.ta)} min` : '-' },
    { label: 'Rejection', value: calcResult.rejectPct ? `${calcResult.rejectPct}%` : '-' },
    { label: 'Constraint', value: isPre ? 'To be confirmed' : (calcResult.bottleneck || '-') },
  ]

  return (
    <>
      <button
        onClick={handleExport}
        disabled={exporting}
        style={{
          padding: '8px 16px', background: 'var(--green)', color: '#fff',
          border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
          cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
          opacity: exporting ? 0.7 : 1,
        }}
      >
        {exporting ? 'Generating PDF…' : 'Export PDF'}
      </button>

      {/* Hidden print-ready layout */}
      <div
        ref={printRef}
        style={{
          display: 'none',
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '800px',
          background: '#fff',
          fontFamily: "'DM Sans', sans-serif",
          color: '#1a1a1a',
          padding: '40px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', borderBottom: '2px solid #0F6E56', paddingBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#0F6E56' }}>Al-RMX</div>
            <div style={{ fontSize: '11px', color: '#6b6b6b', marginTop: '2px' }}>Plant Intelligence Report</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>{meta?.plant || 'Plant Assessment'}</div>
            <div style={{ fontSize: '12px', color: '#6b6b6b' }}>{meta?.country}</div>
            <div style={{ fontSize: '12px', color: '#6b6b6b' }}>
              {meta?.date ? new Date(meta.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {kpis.map(k => (
            <div key={k.label} style={{
              flex: 1, textAlign: 'center', padding: '12px 8px',
              background: '#f9fafb', borderRadius: '8px',
              border: '1px solid #e0e0e0',
            }}>
              <div style={{ fontSize: '10px', color: '#6b6b6b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                {k.label}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#1a1a1a', marginTop: '2px' }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Opening hook */}
        {/* Single recovery range from ValidatedDiagnosis pipeline */}
        {recoveryRange && (recoveryRange.lo > 0 || recoveryRange.hi > 0) && (
          <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: '8px', padding: '18px 20px', marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#0F6E56', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Estimated recoverable margin</div>
            <div style={{ fontSize: '26px', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#0F6E56', marginBottom: '4px' }}>
              {fmt(recoveryRange.lo)} – {fmt(recoveryRange.hi)} / month
            </div>
            <div style={{ fontSize: '10px', color: '#6b6b6b', marginTop: '4px' }}>
              Based on reported data · 40-65% execution range · Exact figure confirmed on-site
            </div>
          </div>
        )}

        {/* AI Report sections */}
        {report?.executive && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F6E56', marginBottom: '8px', borderBottom: '1px solid #E1F5EE', paddingBottom: '4px' }}>
              Executive Summary
            </div>
            <div style={{ fontSize: '12px', lineHeight: 1.7, color: '#3d3d3d', whiteSpace: 'pre-wrap' }}>
              {report.executive}
            </div>
          </div>
        )}

        {report?.diagnosis && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F6E56', marginBottom: '8px', borderBottom: '1px solid #E1F5EE', paddingBottom: '4px' }}>
              Operational Diagnosis
            </div>
            <div style={{ fontSize: '12px', lineHeight: 1.7, color: '#3d3d3d', whiteSpace: 'pre-wrap' }}>
              {report.diagnosis}
            </div>
          </div>
        )}

        {report?.actions && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F6E56', marginBottom: '8px', borderBottom: '1px solid #E1F5EE', paddingBottom: '4px' }}>
              Next Step
            </div>
            <div style={{ fontSize: '12px', lineHeight: 1.7, color: '#3d3d3d', whiteSpace: 'pre-wrap' }}>
              {report.actions}
            </div>
          </div>
        )}

        {/* Findings */}
        {issues.length > 0 && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F6E56', marginBottom: '10px', borderBottom: '1px solid #E1F5EE', paddingBottom: '4px' }}>
              Findings ({issues.length})
            </div>
            {issues.map((issue: Issue, i: number) => (
              <div key={i} style={{
                padding: '10px 14px', marginBottom: '6px', borderRadius: '6px',
                borderLeft: `3px solid ${issue.sev === 'red' ? '#C0392B' : '#D68910'}`,
                background: '#fafafa',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#1a1a1a', lineHeight: 1.4 }}>
                      {issue.t}
                    </div>
                    <div style={{ fontSize: '10px', color: '#0F6E56', marginTop: '2px', fontWeight: 500 }}>
                      {issue.action}
                    </div>
                  </div>
                  {issue.loss > 0 && (
                    <div style={{
                      fontSize: '12px', fontWeight: 600, fontFamily: "'DM Mono', monospace",
                      color: issue.sev === 'red' ? '#C0392B' : '#B7950B',
                      whiteSpace: 'nowrap', marginLeft: '12px',
                    }}>
                      {isPre ? `${fmt(Math.round(issue.loss * 0.7))}-${fmt(Math.round(issue.loss * 1.3))}` : fmt(issue.loss)}/mo
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '32px', paddingTop: '12px', borderTop: '1px solid #e0e0e0', fontSize: '10px', color: '#c8c8c8', display: 'flex', justifyContent: 'space-between' }}>
          <span>Generated by Al-RMX Plant Intelligence Platform</span>
          <span>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    </>
  )
}

export function SummaryPDFButton({ calcResult, answers, meta }: {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  focusActions?: string[]
}) {
  return <ExportPDF calcResult={calcResult} answers={answers} meta={meta} report={null} />
}
