'use client'

import { useState } from 'react'
import type { CalcResult } from '@/lib/calculations'
import type { ValidatedDiagnosis } from '@/lib/diagnosis-pipeline'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, BorderStyle, WidthType,
  ShadingType, HeadingLevel, PageNumber, PageBreak } from 'docx'

interface ExportWordProps {
  calcResult: CalcResult
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  dx: ValidatedDiagnosis
  phase?: string
}

const GREEN = '0F6E56'
const DARK = '1A1A1A'
const GRAY = '666666'
const LIGHT = 'F5F5F5'

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const borders = { top: border, bottom: border, left: border, right: border }

function cell(text: string, opts: { bold?: boolean; color?: string; bg?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; size?: number } = {}) {
  return new TableCell({
    borders,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text, bold: opts.bold || false, color: opts.color || DARK, font: 'Calibri', size: opts.size || 20 })],
    })],
  })
}

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

function textParas(text: string): Paragraph[] {
  return text.split('\n\n').filter(Boolean).map(p =>
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: p.trim(), size: 20, color: DARK })] })
  )
}

function actionParas(text: string): Paragraph[] {
  const lines = text.split('\n').filter(l => l.trim())
  const result: Paragraph[] = []

  for (const line of lines) {
    const numbered = line.match(/^(\d+)\.\s*(.+)$/)
    if (numbered) {
      const boldMatch = numbered[2].match(/^([^:]+):\s*(.+)$/)
      if (boldMatch) {
        result.push(new Paragraph({
          spacing: { after: 80 },
          indent: { left: 360 },
          children: [
            new TextRun({ text: `${numbered[1]}. ${boldMatch[1]}: `, bold: true, size: 20 }),
            new TextRun({ text: boldMatch[2], size: 20 }),
          ],
        }))
      } else {
        result.push(new Paragraph({
          spacing: { after: 80 },
          indent: { left: 360 },
          children: [new TextRun({ text: `${numbered[1]}. ${numbered[2]}`, size: 20 })],
        }))
      }
    } else if (line.match(/^(Immediate|Short-term|Validation|Next Step|Before)/)) {
      result.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(line.trim())],
      }))
    } else {
      result.push(new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: line.trim(), size: 20 })],
      }))
    }
  }
  return result
}

export default function ExportWord({ calcResult, meta, report, dx, phase }: ExportWordProps) {
  const [exporting, setExporting] = useState(false)
  const isPre = phase === 'workshop'
  const plantName = meta?.plant || 'Plant Assessment'
  const country = meta?.country || ''
  const dateStr = meta?.date ? new Date(meta.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const reportType = isPre ? 'Pre-Assessment Report' : 'On-Site Assessment Report'

  async function handleExport() {
    setExporting(true)

    const children: (Paragraph | Table)[] = []

    // Title
    children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: reportType, font: 'Georgia', size: 40, bold: true })] }))
    children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${plantName}  |  ${country}`, size: 22, color: GRAY })] }))
    children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: dateStr, size: 20, color: GRAY })] }))

    // Recovery range box
    const lo = dx.combined_recovery_range.lo
    const hi = dx.combined_recovery_range.hi
    if (lo > 0 || hi > 0) {
      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [9840],
        rows: [new TableRow({ children: [new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 1, color: 'D4EDDA' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D4EDDA' }, left: { style: BorderStyle.SINGLE, size: 6, color: GREEN }, right: { style: BorderStyle.SINGLE, size: 1, color: 'D4EDDA' } },
          shading: { fill: 'F0FAF4', type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          width: { size: 9840, type: WidthType.DXA },
          children: [
            new Paragraph({ children: [
              new TextRun({ text: 'Estimated recoverable margin: ', size: 20 }),
              new TextRun({ text: `${fmt(lo)} - ${fmt(hi)} per month`, bold: true, size: 24, color: GREEN }),
            ]}),
            new Paragraph({ spacing: { before: 40 }, children: [
              new TextRun({ text: dx.tat_source === 'measured'
                ? `Based on ${dx.tat_trip_count} observed truck cycles. 40-65% execution range.`
                : dx.tat_source === 'validated'
                ? 'On-site validated data. 40-65% execution range.'
                : 'Based on reported data. 40-65% execution range. Exact figure confirmed on-site.',
                size: 16, color: GRAY }),
            ]}),
          ],
        })] })],
      }))
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
    }

    // Key metrics
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Key Metrics')] }))

    const metricsRow = [
      { label: 'TURNAROUND', value: `${dx.tat_actual} min`, sub: `target: ${dx.tat_target} min` },
      { label: 'UTILISATION', value: `${dx.utilization_pct}%`, sub: 'target: 85%' },
      { label: 'REJECTION', value: `${dx.reject_pct}%`, sub: 'target: <3%' },
      { label: 'CONSTRAINT', value: isPre ? 'To be confirmed' : dx.primary_constraint, sub: isPre ? `Likely: ${dx.primary_constraint}` : 'turnaround' },
    ]

    children.push(new Table({
      width: { size: 9840, type: WidthType.DXA }, columnWidths: [2460, 2460, 2460, 2460],
      rows: [
        new TableRow({ children: metricsRow.map(m =>
          cell(m.label, { bold: true, color: GRAY, size: 16, bg: LIGHT, width: 2460, align: AlignmentType.CENTER })
        )}),
        new TableRow({ children: metricsRow.map(m =>
          new TableCell({ borders, width: { size: 2460, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.value, bold: true, size: 28, color: m.label === 'TURNAROUND' && dx.tat_actual > dx.tat_target ? 'CC6600' : DARK })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.sub, size: 16, color: GRAY })] }),
          ]})
        )}),
      ],
    }))

    // TAT source badge
    if (dx.tat_source === 'measured' && dx.tat_trip_count > 0) {
      children.push(new Paragraph({ spacing: { before: 60 }, children: [
        new TextRun({ text: `Based on ${dx.tat_trip_count} observed truck cycles`, size: 16, color: GREEN, italics: true }),
      ]}))
    } else if (dx.tat_source === 'validated') {
      children.push(new Paragraph({ spacing: { before: 60 }, children: [
        new TextRun({ text: 'On-site validated data', size: 16, color: GREEN, italics: true }),
      ]}))
    }

    // TAT Breakdown (when available)
    if (dx.tat_breakdown && dx.tat_breakdown.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('TAT Breakdown (On-Site Measurement)')] }))

      const tatRows = dx.tat_breakdown.map(c => {
        const isControllable = c.label.toLowerCase().includes('wait') || c.label.toLowerCase().includes('queue') || c.label.toLowerCase().includes('idle')
        return new TableRow({ children: [
          cell(c.label, { width: 4920, bold: isControllable }),
          cell(`${c.actual} min`, { width: 2460, align: AlignmentType.CENTER, color: isControllable ? 'CC6600' : DARK }),
          cell(`${c.benchmark} min`, { width: 2460, align: AlignmentType.CENTER, color: GRAY }),
        ]})
      })

      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [4920, 2460, 2460],
        rows: [
          new TableRow({ children: [
            cell('Component', { bold: true, bg: LIGHT, width: 4920 }),
            cell('Measured', { bold: true, bg: LIGHT, width: 2460, align: AlignmentType.CENTER }),
            cell('Benchmark', { bold: true, bg: LIGHT, width: 2460, align: AlignmentType.CENTER }),
          ]}),
          ...tatRows,
        ],
      }))
    }

    children.push(new Paragraph({ spacing: { after: 60 }, children: [] }))

    // Helper: replace any recovery range in AI text with authoritative dx values
    const loK = Math.round(lo / 1000)
    const hiK = Math.round(hi / 1000)
    const rangePattern = /\$\d{1,3}k\s*[-–]\s*\$\d{1,3}k\/month|\$\d{1,3}k\s*[-–]\s*\$\d{1,3}k\s*per month|\$[\d,]+\s*[-–]\s*\$[\d,]+\s*\/month|\$[\d,]+\s*[-–]\s*\$[\d,]+\s*per month/gi
    const authoritativeRange = `$${loK}k-$${hiK}k/month`
    const sanitize = (text: string) => text.replace(rangePattern, authoritativeRange)

    // Executive Summary
    if (report?.executive) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(isPre ? 'What the Data Suggests' : 'Executive Summary')] }))
      children.push(...textParas(sanitize(report.executive)))
    }

    // Page break before diagnosis
    if (report?.diagnosis) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(isPre ? 'Preliminary Analysis' : 'Operational Diagnosis')] }))
      children.push(...textParas(sanitize(report.diagnosis)))
    }

    // Action Plan
    if (report?.actions) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(isPre ? 'Preparation & Next Steps' : 'Action Plan')] }))
      children.push(...actionParas(sanitize(report.actions)))
    }

    // Findings from ValidatedDiagnosis
    if (dx.loss_breakdown_detail.length > 0) {
      children.push(new Paragraph({ spacing: { before: 200 }, children: [] }))
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Loss Breakdown')] }))
      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [4920, 2460, 2460],
        rows: [
          new TableRow({ children: [
            cell('Dimension', { bold: true, bg: LIGHT, width: 4920 }),
            cell('Amount', { bold: true, bg: LIGHT, width: 2460, align: AlignmentType.CENTER }),
            cell('Type', { bold: true, bg: LIGHT, width: 2460, align: AlignmentType.CENTER }),
          ]}),
          ...dx.loss_breakdown_detail.map(l => new TableRow({ children: [
            cell(l.dimension, { width: 4920 }),
            cell(`${fmt(l.amount)}/month`, { width: 2460, align: AlignmentType.CENTER }),
            cell(l.classification === 'overlapping' ? 'Throughput loss' : l.classification === 'additive' ? 'Additive leakage' : l.classification, { width: 2460, align: AlignmentType.CENTER, color: GRAY }),
          ]})),
        ],
      }))
    }

    // Footer
    children.push(new Paragraph({ spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC', space: 8 } }, children: [
      new TextRun({ text: 'Generated by alRMX Plant Intelligence Platform', color: GRAY, size: 16, italics: true }),
      new TextRun({ text: `     ${dateStr}`, color: GRAY, size: 16 }),
    ]}))

    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Calibri', size: 20, color: DARK } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 28, bold: true, font: 'Georgia', color: DARK },
            paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 24, bold: true, font: 'Georgia', color: DARK },
            paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
        ],
      },
      sections: [{
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } },
        },
        headers: {
          default: new Header({ children: [new Paragraph({ children: [
            new TextRun({ text: 'alRMX', bold: true, color: GREEN, font: 'Georgia', size: 16 }),
            new TextRun({ text: `  |  ${reportType}`, color: GRAY, size: 16 }),
          ]})] }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: 'Confidential  |  Page ', color: GRAY, size: 14 }),
            new TextRun({ children: [PageNumber.CURRENT], color: GRAY, size: 14 }),
          ]})] }),
        },
        children,
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const blob = new Blob([buffer as unknown as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Al-RMX_${(meta?.plant || 'Report').replace(/\s+/g, '_')}_${meta?.date || 'report'}.docx`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      style={{
        padding: '8px 16px', background: GREEN, color: '#fff',
        border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
        cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
        opacity: exporting ? 0.7 : 1,
      }}
    >
      {exporting ? 'Generating...' : 'Export Word'}
    </button>
  )
}
