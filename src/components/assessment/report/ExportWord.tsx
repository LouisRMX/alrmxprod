'use client'

import { useState } from 'react'
import type { CalcResult } from '@/lib/calculations'
import type { ValidatedDiagnosis } from '@/lib/diagnosis-pipeline'
import type { Issue } from '@/lib/issues'
import type { PriorityMatrix, Quadrant } from '@/lib/priority-matrix'
import type { FieldLogContext } from '@/lib/fieldlog/context'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType,
  ShadingType, HeadingLevel, PageNumber, PageBreak } from 'docx'

interface ExportWordProps {
  calcResult: CalcResult
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string; not_found?: string; implementation?: string } | null
  dx: ValidatedDiagnosis
  issues?: Issue[]
  matrix?: PriorityMatrix | null
  fieldLogContext?: FieldLogContext | null
  phase?: string
}

// ── Design tokens ────────────────────────────────────────────────────────
const GREEN = '0F6E56'
const DARK = '1A1A1A'
const GRAY = '666666'
const LIGHT = 'F5F5F5'
const RED_LIGHT = 'FFE0E0'
const GREEN_LIGHT = 'E0FFE0'
const YELLOW_LIGHT = 'FFFDE0'
const AMBER = 'B8860B'

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

function fmt(n: number): string { return '$' + n.toLocaleString() }
function fmtK(n: number): string { return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}` }

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
        result.push(new Paragraph({ spacing: { after: 80 }, indent: { left: 360 }, children: [
          new TextRun({ text: `${numbered[1]}. ${boldMatch[1]}: `, bold: true, size: 20 }),
          new TextRun({ text: boldMatch[2], size: 20 }),
        ]}))
      } else {
        result.push(new Paragraph({ spacing: { after: 80 }, indent: { left: 360 }, children: [new TextRun({ text: `${numbered[1]}. ${numbered[2]}`, size: 20 })] }))
      }
    } else if (line.match(/^(Immediate|Short-term|Validation|Next Step|Before|Sequencing|Critical|What to|Warning)/)) {
      result.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(line.trim())] }))
    } else {
      result.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: line.trim(), size: 20 })] }))
    }
  }
  return result
}

function sectionHeader(text: string, audience: string): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 100 }, children: [
      new TextRun({ text: audience, size: 14, color: GREEN, italics: true, font: 'Calibri' }),
    ]}),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }),
  ]
}

const QUADRANT_LABELS: Record<string, string> = {
  DO_FIRST: 'Do First (High impact, Low complexity)',
  PLAN_CAREFULLY: 'Plan Carefully (High impact, High complexity)',
  QUICK_WIN: 'Quick Wins (Lower impact, Low complexity)',
  DONT_DO: 'Not Recommended Now (Lower impact, High complexity)',
}

// ── Main Component ───────────────────────────────────────────────────────

export default function ExportWord({ calcResult, meta, report, dx, issues, matrix, fieldLogContext, phase }: ExportWordProps) {
  const [exporting, setExporting] = useState(false)
  const isPre = phase === 'workshop'
  const plantName = meta?.plant || 'Plant Assessment'
  const country = meta?.country || ''
  const dateStr = meta?.date ? new Date(meta.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const reportType = isPre ? 'Pre-Assessment Report' : 'On-Site Assessment Report'

  async function handleExport() {
    setExporting(true)
    const children: (Paragraph | Table)[] = []
    const lo = dx.combined_recovery_range.lo
    const hi = dx.combined_recovery_range.hi
    const loK = Math.round(lo / 1000)
    const hiK = Math.round(hi / 1000)
    const rangePattern = /\$\d{1,3}k\s*[-–]\s*\$\d{1,3}k\/month|\$\d{1,3}k\s*[-–]\s*\$\d{1,3}k\s*per month|\$[\d,]+\s*[-–]\s*\$[\d,]+\s*\/month|\$[\d,]+\s*[-–]\s*\$[\d,]+\s*per month/gi
    const authoritativeRange = `$${loK}k-$${hiK}k/month`
    const sanitize = (text: string) => text.replace(rangePattern, authoritativeRange)
    const ct = dx.calc_trace
    const flc = fieldLogContext

    // ════════════════════════════════════════════════════════════════════
    // TITLE PAGE
    // ════════════════════════════════════════════════════════════════════
    children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: reportType, font: 'Georgia', size: 40, bold: true })] }))
    children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${plantName}  |  ${country}`, size: 22, color: GRAY })] }))
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: dateStr, size: 20, color: GRAY })] }))

    // Assessment basis
    if (flc && flc.total_trips_observed >= 3) {
      children.push(new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: `Assessment basis: ${flc.total_trips_observed} observed truck cycles over ${flc.days_observed} working days.`, size: 18, color: DARK }),
      ]}))
      children.push(new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: flc.total_trips_observed >= 10 ? 'Claim strength: Confirmed' : 'Claim strength: Directional (insufficient cycles for confirmed diagnosis)', size: 18, color: flc.total_trips_observed >= 10 ? GREEN : AMBER }),
      ]}))
    } else if (dx.tat_source === 'validated') {
      children.push(new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: 'Assessment basis: On-site validated data.', size: 18, color: GREEN }),
      ]}))
    }

    // Recovery range box
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
              new TextRun({ text: `${dx.tat_source === 'measured' ? `Based on ${dx.tat_trip_count} observed cycles` : dx.tat_source === 'validated' ? 'On-site validated' : 'Based on reported data'}. 40-65% execution range.`, size: 16, color: GRAY }),
            ]}),
          ],
        })] })],
      }))
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
    }

    // ════════════════════════════════════════════════════════════════════
    // SECTION 1: EXECUTIVE SUMMARY
    // ════════════════════════════════════════════════════════════════════
    children.push(...sectionHeader(isPre ? 'What the Data Suggests' : 'Executive Summary', 'Executive Section'))

    // Key metrics table
    const constraint = isPre ? 'To be confirmed' : (dx.main_driver.dimension || dx.primary_constraint)
    const metricsRow = [
      { label: 'TURNAROUND', value: `${dx.tat_actual} min`, sub: `target: ${dx.tat_target} min` },
      { label: 'UTILISATION', value: `${dx.utilization_pct}%`, sub: 'target: 85%' },
      { label: 'REJECTION', value: `${dx.reject_pct}%`, sub: 'target: <3%' },
      { label: 'CONSTRAINT', value: constraint, sub: isPre ? `Likely: ${constraint}` : `${fmtK(dx.main_driver.amount)}/month` },
    ]
    children.push(new Table({
      width: { size: 9840, type: WidthType.DXA }, columnWidths: [2460, 2460, 2460, 2460],
      rows: [
        new TableRow({ children: metricsRow.map(m => cell(m.label, { bold: true, color: GRAY, size: 16, bg: LIGHT, width: 2460, align: AlignmentType.CENTER })) }),
        new TableRow({ children: metricsRow.map(m =>
          new TableCell({ borders, width: { size: 2460, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.value, bold: true, size: 28, color: m.label === 'TURNAROUND' && dx.tat_actual > dx.tat_target ? 'CC6600' : DARK })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.sub, size: 16, color: GRAY })] }),
          ]})
        ) }),
      ],
    }))

    if (report?.executive) {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
      children.push(...textParas(sanitize(report.executive)))
    } else {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: 'Report not yet generated. Click "Generate report" in the platform before exporting.', size: 18, color: AMBER, italics: true }),
      ]}))
    }

    // ════════════════════════════════════════════════════════════════════
    // SECTION 2: CAPACITY ANALYSIS
    // ════════════════════════════════════════════════════════════════════
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...sectionHeader('Capacity Analysis', 'Executive Section'))

    children.push(new Table({
      width: { size: 9840, type: WidthType.DXA }, columnWidths: [3280, 3280, 3280],
      rows: [
        new TableRow({ children: [
          cell('', { bg: LIGHT, width: 3280 }),
          cell('CURRENT', { bold: true, bg: LIGHT, width: 3280, align: AlignmentType.CENTER }),
          cell('AT TARGET TAT', { bold: true, bg: LIGHT, width: 3280, align: AlignmentType.CENTER }),
        ]}),
        new TableRow({ children: [
          cell('Daily output (m\u00B3)', { width: 3280 }),
          cell(`${ct.actual_daily_m3} m\u00B3`, { width: 3280, align: AlignmentType.CENTER }),
          cell(`${ct.target_daily_m3} m\u00B3`, { width: 3280, align: AlignmentType.CENTER, color: GREEN }),
        ]}),
        new TableRow({ children: [
          cell('Monthly output (m\u00B3)', { width: 3280 }),
          cell(`${ct.actual_daily_m3 * ct.working_days_month} m\u00B3`, { width: 3280, align: AlignmentType.CENTER }),
          cell(`${ct.target_daily_m3 * ct.working_days_month} m\u00B3`, { width: 3280, align: AlignmentType.CENTER, color: GREEN }),
        ]}),
        new TableRow({ children: [
          cell('Contribution margin', { width: 3280 }),
          cell(`${fmt(ct.actual_daily_m3 * ct.working_days_month * ct.margin_per_m3)}/mo`, { width: 3280, align: AlignmentType.CENTER }),
          cell(`${fmt(ct.target_daily_m3 * ct.working_days_month * ct.margin_per_m3)}/mo`, { width: 3280, align: AlignmentType.CENTER, color: GREEN }),
        ]}),
        new TableRow({ children: [
          cell('Monthly gap', { bold: true, width: 3280 }),
          cell('-', { width: 3280, align: AlignmentType.CENTER }),
          cell(`+${fmt(ct.gap_monthly_m3 * ct.margin_per_m3)}/month`, { width: 3280, align: AlignmentType.CENTER, bold: true, color: GREEN }),
        ]}),
        new TableRow({ children: [
          cell('Recovery (40-65%)', { bold: true, width: 3280 }),
          cell('-', { width: 3280, align: AlignmentType.CENTER }),
          cell(`${fmt(lo)}-${fmt(hi)}/month`, { width: 3280, align: AlignmentType.CENTER, bold: true, color: GREEN }),
        ]}),
      ],
    }))

    children.push(new Paragraph({ spacing: { before: 80, after: 60 }, children: [
      new TextRun({ text: 'No additional trucks or plant investment required to achieve this output.', size: 18, color: GRAY, italics: true }),
    ]}))

    // Trips per truck
    children.push(new Paragraph({ spacing: { after: 80 }, children: [
      new TextRun({ text: `Trips per truck per day: ${ct.trips_per_truck} actual vs ${ct.trips_per_truck_target} achievable at ${dx.tat_target}-min TAT.`, size: 20, color: DARK }),
    ]}))

    // ════════════════════════════════════════════════════════════════════
    // SECTION 3: VALUE STREAM ANALYSIS (skip if no data available)
    // ════════════════════════════════════════════════════════════════════
    const vs = flc?.value_stream
    const hasVSMData = vs || (dx.tat_breakdown && dx.tat_breakdown.length > 0)

    if (hasVSMData) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...sectionHeader('Value Stream Analysis', 'Operations Section'))
    if (vs) {
      const vsmRows: [string, string, string, string, string][] = [
        ['Loading + plant queue', `${vs.loading_queue_avg ?? '-'} min`, 'Necessary NVA', 'Waiting', YELLOW_LIGHT],
        ['Outbound transit', `${vs.transit_outbound_avg ?? '-'} min`, 'Necessary NVA', 'Transportation', YELLOW_LIGHT],
        ['Site wait', `${vs.site_wait_avg ?? '-'} min`, 'Pure waste', 'Waiting', RED_LIGHT],
        ['Unloading / pour', `${vs.unload_avg ?? '-'} min`, 'Value-adding', '-', GREEN_LIGHT],
        ['Return transit', `${vs.transit_return_avg ?? '-'} min`, 'Necessary NVA', 'Transportation', YELLOW_LIGHT],
        ['TOTAL CYCLE', `${vs.total_cycle_avg} min`, '-', '-', LIGHT],
      ]
      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [2800, 1600, 2200, 1600, 1640],
        rows: [
          new TableRow({ children: [
            cell('Step', { bold: true, bg: LIGHT, width: 2800 }),
            cell('Avg time', { bold: true, bg: LIGHT, width: 1600, align: AlignmentType.CENTER }),
            cell('Category', { bold: true, bg: LIGHT, width: 2200, align: AlignmentType.CENTER }),
            cell('Waste type', { bold: true, bg: LIGHT, width: 1600, align: AlignmentType.CENTER }),
          ]}),
          ...vsmRows.map(([step, time, cat, waste, bg]) => new TableRow({ children: [
            cell(step, { width: 2800, bold: step === 'TOTAL CYCLE', bg }),
            cell(time, { width: 1600, align: AlignmentType.CENTER, bold: step === 'TOTAL CYCLE', bg }),
            cell(cat, { width: 2200, align: AlignmentType.CENTER, bg }),
            cell(waste, { width: 1600, align: AlignmentType.CENTER, color: GRAY, bg }),
          ]})),
        ],
      }))

      // VA/NVA summary
      children.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [
        new TextRun({ text: `Value-adding: ${vs.va_minutes} min (${vs.va_pct}%)  |  `, size: 18, color: GREEN }),
        new TextRun({ text: `Necessary NVA: ${vs.necessary_nva_minutes} min (${vs.necessary_nva_pct}%)  |  `, size: 18, color: AMBER }),
        new TextRun({ text: `Pure waste: ${vs.nva_minutes} min (${vs.nva_pct}%)`, size: 18, color: 'CC3333' }),
      ]}))
    } else if (dx.tat_breakdown && dx.tat_breakdown.length > 0) {
      // Fallback: TAT breakdown from assessment answers
      children.push(new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: '(Assessor-reported, not measured)', size: 16, color: AMBER, italics: true }),
      ]}))
      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [3280, 1640, 1640, 1640, 1640],
        rows: [
          new TableRow({ children: [
            cell('Component', { bold: true, bg: LIGHT, width: 3280 }),
            cell('Reported', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
            cell('Benchmark', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
            cell('Category', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
            cell('Waste', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
          ]}),
          ...dx.tat_breakdown.map(c => {
            const isWaste = c.label.toLowerCase().includes('wait') || c.label.toLowerCase().includes('queue')
            const isVA = c.label.toLowerCase().includes('unload') || c.label.toLowerCase().includes('pour')
            const category = isWaste ? 'Pure waste' : isVA ? 'Value-adding' : 'Necessary NVA'
            const bg = isWaste ? RED_LIGHT : isVA ? GREEN_LIGHT : YELLOW_LIGHT
            return new TableRow({ children: [
              cell(c.label, { width: 3280, bold: isWaste, bg }),
              cell(`${c.actual} min`, { width: 1640, align: AlignmentType.CENTER, color: isWaste ? 'CC6600' : DARK, bg }),
              cell(`${c.benchmark} min`, { width: 1640, align: AlignmentType.CENTER, color: GRAY, bg }),
              cell(category, { width: 1640, align: AlignmentType.CENTER, bg }),
              cell(isWaste ? 'Waiting' : '-', { width: 1640, align: AlignmentType.CENTER, color: GRAY, bg }),
            ]})
          }),
        ],
      }))
    }

    // TAT variation box
    if (flc?.tat_variation) {
      const tv = flc.tat_variation
      children.push(new Paragraph({ spacing: { before: 80 }, children: [
        new TextRun({ text: `TAT range: ${tv.min}-${tv.max} min  |  Std deviation: ${tv.std_dev} min  |  P25/P75: ${tv.p25}/${tv.p75} min`, size: 18, color: DARK }),
      ]}))
      if (tv.std_dev > 20) {
        children.push(new Paragraph({ children: [
          new TextRun({ text: 'High variation (std dev > 20 min) indicates systemic instability.', size: 18, color: 'CC3333', bold: true }),
        ]}))
      }
    }
    } // end if (hasVSMData)

    // ════════════════════════════════════════════════════════════════════
    // SECTION 4: ROOT CAUSE ANALYSIS
    // ════════════════════════════════════════════════════════════════════
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...sectionHeader(isPre ? 'Preliminary Analysis' : 'Root Cause Analysis', 'Operations Section'))

    if (report?.diagnosis) {
      children.push(...textParas(sanitize(report.diagnosis)))
    } else {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: 'Report not yet generated. Click "Generate report" in the platform before exporting.', size: 18, color: AMBER, italics: true }),
      ]}))
    }

    // Loss breakdown table
    if (dx.loss_breakdown_detail.length > 0) {
      children.push(new Paragraph({ spacing: { before: 120 }, heading: HeadingLevel.HEADING_2, children: [new TextRun('Loss Breakdown')] }))
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

    // ════════════════════════════════════════════════════════════════════
    // SECTION 5: WHAT WE DID NOT FIND
    // ════════════════════════════════════════════════════════════════════
    if (!isPre) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(...sectionHeader('What We Did Not Find', 'Operations Section'))

      if (report?.not_found) {
        children.push(...textParas(report.not_found))
      } else {
        // Auto-generate from dx
        const nonConstraints: string[] = []
        if (dx.primary_constraint !== 'Production') {
          nonConstraints.push(`Plant capacity is not a constraint. The plant can produce ${ct.plant_daily_m3} m\u00B3/day, well above current fleet delivery capacity.`)
        }
        if (dx.primary_constraint !== 'Fleet' && dx.primary_constraint !== 'Demand') {
          nonConstraints.push(`Fleet size is not a constraint. The existing ${dx.trucks_total} trucks can deliver ${ct.fleet_daily_m3} m\u00B3/day at target TAT. More trucks would add cost without adding output until TAT is resolved.`)
        }
        if (dx.reject_pct < 5) {
          nonConstraints.push(`Rejection rate at ${dx.reject_pct}% adds ${fmtK(dx.loss_breakdown_detail.find(l => l.dimension === 'Quality')?.amount ?? 0)}/month in material cost but does not limit throughput. Each rejection is an additive cost, it does not block the next delivery cycle.`)
        }
        for (const nc of nonConstraints) {
          children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: nc, size: 20 })] }))
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // SECTION 6: RECOMMENDATIONS (with priority matrix)
    // ════════════════════════════════════════════════════════════════════
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...sectionHeader(isPre ? 'Preparation & Next Steps' : 'Recommendations', 'Operations Section'))

    // Priority matrix table (on-site only, when matrix available)
    if (!isPre && matrix && matrix.rows.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Priority Matrix')] }))

      for (const q of ['DO_FIRST', 'PLAN_CAREFULLY', 'QUICK_WIN', 'DONT_DO'] as Quadrant[]) {
        const qRows = matrix.rows.filter(r => r.quadrant === q)
        if (qRows.length === 0) continue

        children.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: [
          new TextRun({ text: QUADRANT_LABELS[q] || q, bold: true, size: 20, color: q === 'DO_FIRST' ? GREEN : q === 'PLAN_CAREFULLY' ? AMBER : GRAY }),
        ]}))

        for (const row of qRows) {
          const overrideNote = row.quadrant_source === 'consultant' && row.override_reason ? ` * ${row.override_reason}` : ''
          children.push(new Paragraph({ spacing: { after: 40 }, indent: { left: 360 }, children: [
            new TextRun({ text: `${row.issue_title.slice(0, 70)}`, bold: true, size: 18 }),
            new TextRun({ text: ` - ${row.constraint_note || `${fmtK(row.loss_addressed)}/mo`} (${(row.impact_score * 100).toFixed(0)}% impact) - ${row.urgency} - ${row.org_level}${overrideNote}`, size: 16, color: GRAY }),
          ]}))
        }
      }
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
    }

    // AI-generated action plan
    if (report?.actions) {
      children.push(...actionParas(sanitize(report.actions)))
    } else if (!matrix || matrix.rows.length === 0) {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: 'Report not yet generated. Click "Generate report" in the platform before exporting.', size: 18, color: AMBER, italics: true }),
      ]}))
    }

    // ════════════════════════════════════════════════════════════════════
    // SECTION 7: IMPLEMENTATION CONSIDERATIONS
    // ════════════════════════════════════════════════════════════════════
    if (!isPre) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(...sectionHeader('Implementation Considerations', 'Operations Section'))

      if (report?.implementation) {
        children.push(...textParas(report.implementation))
      } else {
        // Auto-generate basic considerations
        children.push(new Paragraph({ spacing: { after: 100 }, children: [
          new TextRun({ text: `Fix the constraint first. The primary constraint is ${dx.main_driver.dimension || dx.primary_constraint}. Do not optimize rejection rate, fleet size, or plant capacity until turnaround time is moving toward the ${dx.tat_target}-min target. Optimizing non-constraints wastes resources.`, size: 20 }),
        ]}))

        if (matrix) {
          const capitalItems = matrix.rows.filter(r => issues?.find(i => i.t === r.issue_title)?.complexity?.requires_capital)
          const contractItems = matrix.rows.filter(r => issues?.find(i => i.t === r.issue_title)?.complexity?.requires_contract_change)
          if (capitalItems.length > 0) {
            children.push(new Paragraph({ spacing: { after: 80 }, children: [
              new TextRun({ text: `Capital requirements: ${capitalItems.length} recommendation(s) require investment. Review these in the Plan Carefully quadrant before committing budget.`, size: 20 }),
            ]}))
          }
          if (contractItems.length > 0) {
            children.push(new Paragraph({ spacing: { after: 80 }, children: [
              new TextRun({ text: `Contract changes: ${contractItems.length} recommendation(s) require contract modifications (demurrage, liability). Initiate commercial discussions early as these have the longest lead time.`, size: 20 }),
            ]}))
          }
        }

        children.push(new Paragraph({ spacing: { after: 80 }, children: [
          new TextRun({ text: 'Each action requires a confirmed owner and start date assigned by plant management before implementation begins.', size: 20, bold: true }),
        ]}))
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // SECTION 8: DATA APPENDIX
    // ════════════════════════════════════════════════════════════════════
    if (flc && flc.total_trips_observed >= 10) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(...sectionHeader('Data Appendix', 'Reference'))

      children.push(new Paragraph({ spacing: { after: 80 }, children: [
        new TextRun({ text: `Assessment basis: ${flc.total_trips_observed} observed truck cycles, ${flc.days_observed} working days`, size: 18, color: DARK }),
      ]}))

      // Fleet performance matrix
      if (flc.truck_matrix.length >= 2) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Fleet Performance Matrix')] }))
        children.push(new Table({
          width: { size: 9840, type: WidthType.DXA }, columnWidths: [1640, 1640, 1640, 1640, 1640, 1640],
          rows: [
            new TableRow({ children: [
              cell('Truck', { bold: true, bg: LIGHT, width: 1640 }),
              cell('Trips', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
              cell('Avg TAT', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
              cell('Std Dev', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
              cell('Rejects', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
              cell('Status', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
            ]}),
            ...flc.truck_matrix.slice(0, 20).map(t => new TableRow({ children: [
              cell(t.truck_id, { width: 1640 }),
              cell(String(t.total_trips), { width: 1640, align: AlignmentType.CENTER }),
              cell(`${t.avg_tat} min`, { width: 1640, align: AlignmentType.CENTER }),
              cell(`${t.std_dev} min`, { width: 1640, align: AlignmentType.CENTER }),
              cell(String(t.reject_count), { width: 1640, align: AlignmentType.CENTER }),
              cell(t.status === 'Outlier' ? '\u26A0 Outlier' : t.status, { width: 1640, align: AlignmentType.CENTER, color: t.status === 'Outlier' ? 'CC3333' : t.status === 'Watch' ? AMBER : GRAY }),
            ]})),
          ],
        }))
        children.push(new Paragraph({ spacing: { before: 40, after: 80 }, children: [
          new TextRun({ text: 'Normal: < 110% of fleet avg  |  Watch: 110-130%  |  Outlier: > 130%', size: 14, color: GRAY }),
        ]}))
      }

      // Site performance matrix
      if (flc.site_matrix.length >= 2) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Site Performance Matrix')] }))
        children.push(new Table({
          width: { size: 9840, type: WidthType.DXA }, columnWidths: [2460, 1640, 1640, 1380, 1380, 1340],
          rows: [
            new TableRow({ children: [
              cell('Site', { bold: true, bg: LIGHT, width: 2460 }),
              cell('Deliveries', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
              cell('Avg Wait', { bold: true, bg: LIGHT, width: 1640, align: AlignmentType.CENTER }),
              cell('% Volume', { bold: true, bg: LIGHT, width: 1380, align: AlignmentType.CENTER }),
              cell('% Wait', { bold: true, bg: LIGHT, width: 1380, align: AlignmentType.CENTER }),
              cell('Coverage', { bold: true, bg: LIGHT, width: 1340, align: AlignmentType.CENTER }),
            ]}),
            ...flc.site_matrix.slice(0, 15).map(s => new TableRow({ children: [
              cell(s.site_name.slice(0, 25), { width: 2460 }),
              cell(String(s.total_deliveries), { width: 1640, align: AlignmentType.CENTER }),
              cell(s.avg_site_wait != null ? `${s.avg_site_wait} min` : (s.coverage < 50 ? 'incomplete' : '-'), { width: 1640, align: AlignmentType.CENTER, color: s.avg_site_wait != null && s.avg_site_wait > 35 ? 'CC6600' : DARK }),
              cell(`${s.pct_of_total_deliveries}%`, { width: 1380, align: AlignmentType.CENTER }),
              cell(`${s.pct_of_total_site_wait}%`, { width: 1380, align: AlignmentType.CENTER }),
              cell(`${s.coverage}%`, { width: 1340, align: AlignmentType.CENTER, color: s.coverage < 50 ? 'CC3333' : GRAY }),
            ]})),
          ],
        }))
      }

      // Baseline/current comparison
      if (flc.baseline_current) {
        const bc = flc.baseline_current
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Performance Trend')] }))
        children.push(new Table({
          width: { size: 9840, type: WidthType.DXA }, columnWidths: [3280, 3280, 3280],
          rows: [
            new TableRow({ children: [
              cell('', { bg: LIGHT, width: 3280 }),
              cell(`Baseline (${bc.baseline.days})`, { bold: true, bg: LIGHT, width: 3280, align: AlignmentType.CENTER }),
              cell(`Current (${bc.current.days})`, { bold: true, bg: LIGHT, width: 3280, align: AlignmentType.CENTER }),
            ]}),
            new TableRow({ children: [
              cell('Avg TAT', { width: 3280 }),
              cell(`${bc.baseline.avg_tat} min`, { width: 3280, align: AlignmentType.CENTER }),
              cell(`${bc.current.avg_tat} min`, { width: 3280, align: AlignmentType.CENTER, color: bc.current.avg_tat < bc.baseline.avg_tat ? GREEN : 'CC3333' }),
            ]}),
            new TableRow({ children: [
              cell('Trips/day', { width: 3280 }),
              cell(`${bc.baseline.trips_per_day}`, { width: 3280, align: AlignmentType.CENTER }),
              cell(`${bc.current.trips_per_day}`, { width: 3280, align: AlignmentType.CENTER, color: bc.current.trips_per_day > bc.baseline.trips_per_day ? GREEN : DARK }),
            ]}),
            new TableRow({ children: [
              cell('Reject rate', { width: 3280 }),
              cell(`${bc.baseline.reject_pct}%`, { width: 3280, align: AlignmentType.CENTER }),
              cell(`${bc.current.reject_pct}%`, { width: 3280, align: AlignmentType.CENTER, color: bc.current.reject_pct < bc.baseline.reject_pct ? GREEN : 'CC3333' }),
            ]}),
          ],
        }))
      }

      // Interventions
      if (flc.interventions.length > 0) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Intervention Log')] }))
        for (const intv of flc.interventions) {
          children.push(new Paragraph({ spacing: { after: 40 }, children: [
            new TextRun({ text: `${intv.date} - ${intv.title}`, bold: true, size: 18 }),
          ]}))
          if (intv.target_metric) {
            children.push(new Paragraph({ indent: { left: 360 }, children: [
              new TextRun({ text: `Target: ${intv.target_metric}`, size: 16, color: GRAY }),
            ]}))
          }
          if (intv.avg_tat_before != null && intv.avg_tat_after != null) {
            children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 60 }, children: [
              new TextRun({ text: `TAT before: ${intv.avg_tat_before} min \u2192 after: ${intv.avg_tat_after} min (${intv.approximate ? 'approximate' : 'confirmed'})`, size: 16, color: intv.avg_tat_after < intv.avg_tat_before ? GREEN : 'CC3333' }),
            ]}))
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // FOOTER
    // ════════════════════════════════════════════════════════════════════
    children.push(new Paragraph({ spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC', space: 8 } }, children: [
      new TextRun({ text: 'Generated by alRMX Plant Intelligence Platform', color: GRAY, size: 16, italics: true }),
      new TextRun({ text: `     ${dateStr}`, color: GRAY, size: 16 }),
    ]}))

    // ════════════════════════════════════════════════════════════════════
    // BUILD DOCUMENT
    // ════════════════════════════════════════════════════════════════════
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

  const hasReport = !!(report?.executive || report?.diagnosis || report?.actions)

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      title={hasReport ? '' : 'Generate report first'}
      style={{
        padding: '8px 16px', background: hasReport ? GREEN : '#999', color: '#fff',
        border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
        cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
        opacity: exporting ? 0.7 : 1,
      }}
    >
      {exporting ? 'Generating...' : hasReport ? 'Export Word' : 'Export Word (generate report first)'}
    </button>
  )
}
