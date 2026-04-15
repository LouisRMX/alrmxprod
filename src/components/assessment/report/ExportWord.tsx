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

import type { ReportCalculations, ReportInput } from '@/lib/reportCalculations'
import { assembleBoldSummaryLine } from '@/lib/reportAssembly'

interface ExportWordProps {
  calcResult: CalcResult
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string; not_found?: string; implementation?: string } | null
  dx: ValidatedDiagnosis
  issues?: Issue[]
  matrix?: PriorityMatrix | null
  fieldLogContext?: FieldLogContext | null
  phase?: string
  rc?: ReportCalculations
  reportInput?: ReportInput
}

// ── Design tokens ────────────────────────────────────────────────────────
const FONT = 'Calibri'
const GREEN = '0F6E56'
const DARK = '1A1A1A'
const GRAY = '666666'
const LIGHT = 'F5F5F5'
const RED_LIGHT = 'FFE0E0'
const GREEN_LIGHT = 'E0FFE0'
const YELLOW_LIGHT = 'FFFDE0'
const AMBER = 'B8860B'

// Typography scale (docx sizes are in half-points: 22 = 11pt)
const SZ_BODY = 22         // 11pt — body text
const SZ_TABLE = 20        // 10pt — table body
const SZ_SECTION = 28      // 14pt — section headers
const SZ_SUBSECTION = 24   // 12pt — subsection headers
const SZ_SMALL = 18        // 9pt — labels, footnotes
const SZ_KPI_VALUE = 40    // 20pt — KPI main values
const SZ_KPI_LABEL = 18    // 9pt — KPI labels
const SZ_KPI_TARGET = 18   // 9pt — KPI target lines
const SZ_RECOVERY = 28     // 14pt — recovery banner figure
const SZ_TITLE = 36        // 18pt — document title
const SZ_PLANT = 24        // 12pt — plant name line
const SZ_DATE = 20         // 10pt — date line

// Line spacing (240 = single, 276 = 1.15x)
const LINE_BODY = 276
const LINE_TABLE = 240

// Paragraph spacing (twips)
const SP_BEFORE_PARA = 120   // ~6pt
const SP_AFTER_PARA = 120    // ~6pt
const SP_BEFORE_SECTION = 280 // ~14pt
const SP_AFTER_SECTION = 160  // ~8pt

// Table cell margins (twips): top 4pt=80, bottom 4pt=80, left 6pt=120, right 6pt=120
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 }

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const borders = { top: border, bottom: border, left: border, right: border }

function cell(text: string, opts: { bold?: boolean; color?: string; bg?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; size?: number } = {}) {
  return new TableCell({
    borders,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    margins: CELL_MARGINS,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { line: LINE_TABLE },
      children: [new TextRun({ text, bold: opts.bold || false, color: opts.color || DARK, font: FONT, size: opts.size || SZ_TABLE })],
    })],
  })
}

function fmt(n: number): string {
  // Round to nearest $1,000 for all values >= $1k (avoids false precision from estimated inputs)
  const display = n >= 1000 ? Math.round(n / 1000) * 1000 : Math.round(n)
  return '$' + display.toLocaleString('en-US')
}
function fmtK(n: number): string { return n >= 1000 ? `$${Math.round(n / 1000).toLocaleString('en-US')}k` : `$${n.toLocaleString('en-US')}` }

// Parse inline markdown (bold, italic) into TextRun children
function inlineRuns(text: string, baseOpts: { size?: number; color?: string } = {}): TextRun[] {
  const runs: TextRun[] = []
  const size = baseOpts.size || SZ_BODY
  const color = baseOpts.color || DARK
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size, color, font: FONT }))
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true, size, color, font: FONT }))
    } else if (part) {
      runs.push(new TextRun({ text: part, size, color, font: FONT }))
    }
  }
  return runs
}

// Convert markdown text to Word paragraphs and tables
function markdownToParas(text: string): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = []
  const blocks = text.split(/\n{2,}/)

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    // Heading: ## or ###
    const headingMatch = trimmed.match(/^(#{2,3})\s+(.+)$/)
    if (headingMatch) {
      const isH2 = headingMatch[1].length === 2
      result.push(new Paragraph({
        spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION },
        children: [new TextRun({ text: headingMatch[2], bold: true, size: isH2 ? SZ_SUBSECTION : SZ_TABLE, font: FONT, color: DARK })],
      }))
      continue
    }

    // Markdown table
    if (trimmed.includes('|') && trimmed.split('\n').length >= 2) {
      const rows = trimmed.split('\n').filter(r => r.trim() && !r.trim().match(/^\|[-:| ]+\|$/))
      if (rows.length >= 2 && rows[0].includes('|')) {
        const parseRow = (r: string) => r.split('|').map(c => c.trim()).filter(Boolean)
        const headerCells = parseRow(rows[0])
        const tableRows: TableRow[] = []
        tableRows.push(new TableRow({
          children: headerCells.map(h => cell(h, { bold: true, bg: LIGHT, size: SZ_TABLE })),
        }))
        for (let i = 1; i < rows.length; i++) {
          const cells = parseRow(rows[i])
          tableRows.push(new TableRow({
            children: cells.map(c => {
              const runs = inlineRuns(c, { size: SZ_TABLE })
              return new TableCell({
                borders,
                margins: CELL_MARGINS,
                children: [new Paragraph({ spacing: { line: LINE_TABLE }, children: runs })],
              })
            }),
          }))
        }
        result.push(new Table({ rows: tableRows, width: { size: 9000, type: WidthType.DXA } }))
        result.push(new Paragraph({ spacing: { after: 80 }, children: [] }))
        continue
      }
    }

    // Numbered list items (may span multiple lines in one block)
    const lines = trimmed.split('\n')
    if (lines[0].match(/^\d+\.\s/)) {
      for (const line of lines) {
        const numbered = line.match(/^\d+\.\s*(.+)$/)
        if (numbered) {
          result.push(new Paragraph({
            spacing: { before: SP_BEFORE_PARA, after: SP_AFTER_PARA, line: LINE_BODY }, indent: { left: 360 },
            children: inlineRuns(numbered[1]),
          }))
        }
      }
      continue
    }

    // Bullet list items
    if (lines[0].match(/^[-*]\s/)) {
      for (const line of lines) {
        const bullet = line.match(/^[-*]\s+(.+)$/)
        if (bullet) {
          result.push(new Paragraph({
            spacing: { before: 40, after: SP_AFTER_PARA, line: LINE_BODY }, indent: { left: 360 },
            children: [new TextRun({ text: '  \u2022  ', size: SZ_BODY, font: FONT }), ...inlineRuns(bullet[1])],
          }))
        }
      }
      continue
    }

    // Regular paragraph
    const paraText = lines.join(' ').trim()
    result.push(new Paragraph({ spacing: { before: SP_BEFORE_PARA, after: SP_AFTER_PARA, line: LINE_BODY }, children: inlineRuns(paraText) }))
  }

  return result
}

// Legacy aliases
function textParas(text: string): (Paragraph | Table)[] { return markdownToParas(text) }
function actionParas(text: string): (Paragraph | Table)[] { return markdownToParas(text) }

// Strip AI-generated markdown headings not in the approved whitelist
// Operates on raw markdown text BEFORE conversion to docx paragraphs
function stripUnauthorizedHeadings(text: string, allowedHeadings: string[]): string {
  const allowed = new Set(allowedHeadings.map(h => h.toLowerCase().trim()))
  return text.replace(/^#{2,3}\s+(.+)$/gm, (match, heading) => {
    if (allowed.has(heading.toLowerCase().trim())) return match
    return '' // Remove unauthorized heading line
  })
}

function sectionHeader(text: string, audience: string): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: SP_BEFORE_SECTION }, children: [
      new TextRun({ text: audience, size: SZ_SMALL, color: GREEN, italics: true, font: FONT }),
    ]}),
    new Paragraph({ spacing: { after: SP_AFTER_SECTION }, children: [
      new TextRun({ text, bold: true, size: SZ_SECTION, font: FONT, color: DARK }),
    ]}),
  ]
}

const QUADRANT_LABELS: Record<string, string> = {
  DO_FIRST: 'Do First (High impact, Low complexity)',
  PLAN_CAREFULLY: 'Plan Carefully (High impact, High complexity)',
  QUICK_WIN: 'Quick Wins (Lower impact, Low complexity)',
  DONT_DO: 'Not Recommended Now (Lower impact, High complexity)',
}

// ── Main Component ───────────────────────────────────────────────────────

export default function ExportWord({ calcResult, meta, report, dx, issues, matrix, fieldLogContext, phase, rc, reportInput }: ExportWordProps) {
  const [exporting, setExporting] = useState(false)
  const isPre = phase === 'workshop'
  const plantName = meta?.plant || 'Plant Assessment'
  const country = meta?.country || ''
  const dateStr = meta?.date ? new Date(meta.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const reportType = isPre ? 'Pre-Assessment Report' : 'On-Site Assessment Report'

  async function handleExport() {
    setExporting(true)
    const children: (Paragraph | Table)[] = []
    // Deduplication guard: prevent any programmatic element from appearing twice
    const inserted = new Set<string>()
    // Use rc values when available; fall back to dx (old system)
    const lo = rc?.recovery_low_usd ?? dx.combined_recovery_range.lo
    const hi = rc?.recovery_high_usd ?? dx.combined_recovery_range.hi
    const loK = Math.round(lo / 1000)
    const hiK = Math.round(hi / 1000)
    // Catches: $54k-$88k/month, $54,361-$88,336/month, $111k–$160k monthly range, $54k to $88k per month
    const rangePattern = /\$[\d,.]+k?\s*[-–]\s*\$[\d,.]+k?\s*(?:\/month|per month|monthly\s*\w*)/gi
    const authoritativeRange = `$${loK}k-$${hiK}k/month`
    const sanitize = (text: string) => text.replace(rangePattern, authoritativeRange)
    const ct = dx.calc_trace
    const flc = fieldLogContext

    // ════════════════════════════════════════════════════════════════════
    // TITLE PAGE
    // ════════════════════════════════════════════════════════════════════
    children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: reportType, font: FONT, size: SZ_TITLE, bold: true, color: DARK })] }))
    children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${plantName}  |  ${country}`, font: FONT, size: SZ_PLANT, color: GRAY })] }))
    children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: dateStr, font: FONT, size: SZ_DATE, color: GRAY })] }))
    // Consultant identity block
    // TODO: Replace text logo with ImageRun when /public/al-cem-logo.png is added
    children.push(new Paragraph({ spacing: { before: 200, after: 60 }, alignment: AlignmentType.LEFT, children: [
      new TextRun({ text: 'Al-Cem', font: FONT, size: SZ_SECTION, bold: true, color: GREEN }),
    ]}))
    children.push(new Paragraph({ spacing: { after: 20 }, children: [
      new TextRun({ text: 'Prepared by Louis Hellmann', font: FONT, size: SZ_BODY, color: DARK }),
    ]}))
    children.push(new Paragraph({ spacing: { after: 200 }, children: [
      new TextRun({ text: 'Operational Excellence Consultant \u2014 Al-Cem', font: FONT, size: SZ_SMALL, color: GRAY, italics: true }),
    ]}))

    // Assessment basis
    if (flc && flc.total_trips_observed >= 3) {
      children.push(new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: `Assessment basis: ${flc.total_trips_observed} observed truck cycles over ${flc.days_observed} working days.`, size: SZ_SMALL, font: FONT, color: DARK }),
      ]}))
      children.push(new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: flc.total_trips_observed >= 10 ? 'Claim strength: Confirmed' : 'Claim strength: Directional (insufficient cycles for confirmed diagnosis)', size: SZ_SMALL, font: FONT, color: flc.total_trips_observed >= 10 ? GREEN : AMBER }),
      ]}))
    } else if (dx.tat_source === 'validated') {
      children.push(new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: 'Assessment basis: On-site validated data.', size: SZ_SMALL, font: FONT, color: GREEN }),
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
              new TextRun({ text: 'You are leaving estimated ', size: SZ_BODY, font: FONT }),
              new TextRun({ text: `${fmt(lo)} - ${fmt(hi)}`, bold: true, size: SZ_RECOVERY, font: FONT, color: GREEN }),
              new TextRun({ text: ' in recoverable margin every month.', size: SZ_BODY, font: FONT }),
            ]}),
            new Paragraph({ spacing: { before: 40 }, children: [
              new TextRun({ text: `${dx.tat_source === 'measured' ? `Based on ${dx.tat_trip_count} observed cycles` : dx.tat_source === 'validated' ? 'On-site validated' : 'Based on reported data'}. 40-65% execution range.`, size: SZ_SMALL, font: FONT, color: GRAY }),
            ]}),
          ],
        })] })],
      }))
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
    }

    // ── BREAKDOWN 1: How this is calculated (contribution margin basis) ──
    if (isPre && rc && reportInput) {
      children.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [
        new TextRun({ text: 'How this is calculated', bold: true, size: SZ_BODY, font: FONT, color: DARK }),
      ]}))
      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [5400, 4440],
        rows: [
          new TableRow({ children: [
            cell('Selling price per m\u00B3', { width: 5400 }),
            cell(`$${reportInput.selling_price_per_m3.toFixed(2)}`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Material cost per m\u00B3', { width: 5400 }),
            cell(`$${reportInput.material_cost_per_m3.toFixed(2)}`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Material contribution per m\u00B3', { width: 5400, bold: true, bg: LIGHT }),
            cell(`$${rc.contribution_margin_per_m3.toFixed(2)}`, { width: 4440, align: AlignmentType.RIGHT, bold: true, bg: LIGHT }),
          ]}),
        ],
      }))
      children.push(new Paragraph({ spacing: { before: 40, after: 120 }, children: [
        new TextRun({ text: 'Material cost only. Fuel, labour and overhead not included.', size: SZ_SMALL, font: FONT, color: GRAY, italics: true }),
      ]}))
    }

    // ════════════════════════════════════════════════════════════════════
    // SECTION 1: EXECUTIVE SUMMARY (all financial content in one flow)
    // ════════════════════════════════════════════════════════════════════
    children.push(...sectionHeader(isPre ? 'What the Data Suggests' : 'Executive Summary', 'Executive Section'))

    // KPI values: use rc when available, fall back to dx
    const kpiTatTarget = rc?.target_tat_min ?? dx.tat_target
    const kpiTatActual = rc ? reportInput!.avg_turnaround_min : dx.tat_actual
    const tatExcessPct = kpiTatTarget > 0 ? (kpiTatActual - kpiTatTarget) / kpiTatTarget : 0
    const hasConflictingConstraints = isPre && tatExcessPct > 0.2 && ct.plant_daily_m3 < ct.fleet_target_daily_m3
    const hasDispatchSignals = dx.utilization_pct < 80
    const isDispatchScenario = tatExcessPct <= 0.2 && hasDispatchSignals
    const constraintLabel = isPre
      ? (rc ? rc.constraint // Use rc constraint directly when available
        : hasConflictingConstraints ? 'Fleet & capacity \u2014 verify on-site'
        : tatExcessPct > 0.2 ? 'Fleet coordination'
        : isDispatchScenario ? 'Dispatch timing'
        : (dx.main_driver.dimension === 'Fleet' ? 'Fleet coordination' : dx.main_driver.dimension || 'To be confirmed'))
      : (dx.main_driver.dimension || dx.primary_constraint)

    // 1. KPI header table
    const RED = 'CC3333'
    const KPI_GREEN = '1A6644'
    const metricsRow = [
      { label: 'TURNAROUND', value: `${kpiTatActual} min`, sub: `target: ~${kpiTatTarget} min`, valueColor: kpiTatActual > kpiTatTarget ? RED : KPI_GREEN },
      { label: 'UTILISATION', value: `${rc?.utilisation_actual_pct ?? dx.utilization_pct}%`, sub: 'target: ~85%', valueColor: (rc?.utilisation_actual_pct ?? dx.utilization_pct) < 85 ? RED : KPI_GREEN },
      { label: 'REJECTION', value: `${dx.reject_pct}%`, sub: 'target: <3%', valueColor: dx.reject_pct <= 3 ? KPI_GREEN : RED },
      { label: 'CONSTRAINT', value: isPre ? (constraintLabel.startsWith('Likely:') ? constraintLabel : `Likely: ${constraintLabel}`) : constraintLabel, sub: isPre ? (rc?.constraint_note || 'To be confirmed on-site') : `${fmtK(dx.main_driver.amount)}/month`, valueColor: DARK },
    ]
    children.push(new Table({
      width: { size: 9840, type: WidthType.DXA }, columnWidths: [2460, 2460, 2460, 2460],
      rows: [
        new TableRow({ children: metricsRow.map(m => cell(m.label, { bold: true, color: GRAY, size: SZ_KPI_LABEL, bg: LIGHT, width: 2460, align: AlignmentType.CENTER })) }),
        new TableRow({ children: metricsRow.map(m =>
          new TableCell({ borders, width: { size: 2460, type: WidthType.DXA }, margins: CELL_MARGINS, children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.value, bold: true, size: SZ_KPI_VALUE, font: FONT, color: m.valueColor })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.sub, size: SZ_KPI_TARGET, font: FONT, color: GRAY })] }),
          ]})
        ) }),
      ],
    }))

    // 2. Opening line
    if (isPre) {
      children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [
        new TextRun({ text: `Based on your reported data, here is where ${plantName} stands today.`, size: SZ_BODY, font: FONT, color: DARK }),
      ]}))
    }

    // 3. Bold summary line (deterministic, never AI-generated)
    if (isPre && !inserted.has('fleet-reframe')) {
      inserted.add('fleet-reframe')
      const boldLine = rc && reportInput
        ? assembleBoldSummaryLine(rc, reportInput)
        : `Fleet produces ${ct.trips_per_truck} trips per truck per day against a target of ${ct.trips_per_truck_target}.`
      children.push(new Paragraph({ spacing: { before: 160, after: 160 }, children: [
        new TextRun({ text: boldLine, bold: true, size: SZ_BODY, font: FONT }),
      ]}))
    }

    // ── BREAKDOWN 2: Trip calculation basis ──
    if (isPre && rc && reportInput) {
      const opMinutes = reportInput.operating_hours_per_day * 60
      const tripsActualDec = (Math.round(rc.actual_trips_per_truck_per_day * 10) / 10).toFixed(1)
      const tripsTargetDec = (Math.round(rc.target_trips_per_truck_per_day * 10) / 10).toFixed(1)
      const targetTripsTotal = Math.round(rc.target_trips_per_truck_per_day * reportInput.trucks_assigned)
      const actualTripsTotal = Math.round(rc.actual_trips_per_truck_per_day * reportInput.trucks_assigned)
      // Reverse-engineer radius_km from target_tat (formula: tat = 60 + radius_km * 3, capped 75-150)
      const radiusKm = Math.round((rc.target_tat_min - 60) / 3)
      const radiusLabel = radiusKm < 10 ? 'under 10 km' : radiusKm < 20 ? '10-20 km' : 'over 20 km'

      children.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [
        new TextRun({ text: 'Trip calculation basis', bold: true, size: SZ_BODY, font: FONT, color: DARK }),
      ]}))
      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [4320, 2760, 2760],
        rows: [
          new TableRow({ children: [
            cell('', { bg: LIGHT, width: 4320 }),
            cell('TARGET', { bold: true, bg: LIGHT, width: 2760, align: AlignmentType.CENTER }),
            cell('ACTUAL', { bold: true, bg: LIGHT, width: 2760, align: AlignmentType.CENTER }),
          ]}),
          new TableRow({ children: [
            cell('Operating minutes per day', { width: 4320 }),
            cell(`${opMinutes} min`, { width: 2760, align: AlignmentType.CENTER }),
            cell(`${opMinutes} min`, { width: 2760, align: AlignmentType.CENTER }),
          ]}),
          new TableRow({ children: [
            cell('Turnaround time', { width: 4320 }),
            cell(`${rc.target_tat_min} min`, { width: 2760, align: AlignmentType.CENTER, color: GREEN }),
            cell(`${reportInput.avg_turnaround_min} min`, { width: 2760, align: AlignmentType.CENTER }),
          ]}),
          new TableRow({ children: [
            cell('Trips per truck per day', { width: 4320 }),
            cell(tripsTargetDec, { width: 2760, align: AlignmentType.CENTER, color: GREEN }),
            cell(tripsActualDec, { width: 2760, align: AlignmentType.CENTER }),
          ]}),
          new TableRow({ children: [
            cell('Trucks assigned', { width: 4320 }),
            cell(`${reportInput.trucks_assigned}`, { width: 2760, align: AlignmentType.CENTER }),
            cell(`${reportInput.trucks_assigned}`, { width: 2760, align: AlignmentType.CENTER }),
          ]}),
          new TableRow({ children: [
            cell('Trips per day, full fleet', { width: 4320, bold: true, bg: LIGHT }),
            cell(`${targetTripsTotal}`, { width: 2760, align: AlignmentType.CENTER, bold: true, bg: LIGHT, color: GREEN }),
            cell(`${actualTripsTotal}`, { width: 2760, align: AlignmentType.CENTER, bold: true, bg: LIGHT }),
          ]}),
        ],
      }))
      children.push(new Paragraph({ spacing: { before: 40, after: 120 }, children: [
        new TextRun({ text: `Target TAT based on ${rc.target_tat_min}-minute benchmark for ${radiusLabel} delivery zone: 60 min plant and site handling plus ${radiusKm} km round-trip travel at 1.5 min/km.`, size: SZ_SMALL, font: FONT, color: GRAY, italics: true }),
      ]}))
    }

    // 4. AI narrative (explains the gap)
    if (report?.executive) {
      let execText = sanitize(report.executive).replace(/^#{1,3}\s*(What the Data Suggests|Executive Summary|Executive Explanation)\s*\n+/i, '')
      execText = stripUnauthorizedHeadings(execText, ['Initial Analysis', 'Capacity Detail', 'Where the gap sits'])
      children.push(...textParas(execText))
    } else {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: 'Report not yet generated. Click "Generate report" in the platform before exporting.', size: SZ_SMALL, font: FONT, color: AMBER, italics: true }),
      ]}))
    }

    // 5. Capacity Detail (merged from former Capacity Analysis section)
    children.push(new Paragraph({ spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION }, children: [
      new TextRun({ text: 'Capacity Detail', bold: true, size: SZ_SUBSECTION, font: FONT, color: DARK }),
    ]}))

    // Capacity values: use rc when available, fall back to ct
    const capActualDaily = rc?.actual_daily_output_m3 ?? ct.actual_daily_m3
    const capTargetDaily = rc?.target_daily_output_m3 ?? ct.target_daily_m3
    const capOpDays = rc?.op_days_per_month ?? ct.working_days_month
    const capMargin = rc?.contribution_margin_per_m3 ?? ct.margin_per_m3
    const capMonthlyGap = rc?.monthly_gap_usd ?? Math.round(ct.gap_monthly_m3 * ct.margin_per_m3 / 1000) * 1000
    const capRecLo = rc?.recovery_low_usd ?? lo
    const capRecHi = rc?.recovery_high_usd ?? hi

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
          cell(`${capActualDaily} m\u00B3`, { width: 3280, align: AlignmentType.CENTER }),
          cell(`${capTargetDaily} m\u00B3`, { width: 3280, align: AlignmentType.CENTER, color: GREEN }),
        ]}),
        new TableRow({ children: [
          cell('Monthly output (m\u00B3)', { width: 3280 }),
          cell(`${capActualDaily * capOpDays} m\u00B3`, { width: 3280, align: AlignmentType.CENTER }),
          cell(`${capTargetDaily * capOpDays} m\u00B3`, { width: 3280, align: AlignmentType.CENTER, color: GREEN }),
        ]}),
        new TableRow({ children: [
          cell('Contribution margin', { width: 3280 }),
          cell(`${fmt(capActualDaily * capOpDays * capMargin)}/mo`, { width: 3280, align: AlignmentType.CENTER }),
          cell(`${fmt(capTargetDaily * capOpDays * capMargin)}/mo`, { width: 3280, align: AlignmentType.CENTER, color: GREEN }),
        ]}),
        new TableRow({ children: [
          cell('Monthly revenue gap', { bold: true, width: 3280 }),
          cell('-', { width: 3280, align: AlignmentType.CENTER }),
          cell(`+${fmt(capMonthlyGap)}/month`, { width: 3280, align: AlignmentType.CENTER, bold: true, color: GREEN }),
        ]}),
        new TableRow({ children: [
          cell('Recovery (40-65%)', { bold: true, width: 3280 }),
          cell('-', { width: 3280, align: AlignmentType.CENTER }),
          cell(`${fmt(capRecLo)}-${fmt(capRecHi)}/month`, { width: 3280, align: AlignmentType.CENTER, bold: true, color: GREEN }),
        ]}),
      ],
    }))

    const tripsActual = rc ? (Math.round(rc.actual_trips_per_truck_per_day * 10) / 10).toFixed(1) : ct.trips_per_truck
    const tripsTarget = rc ? (Math.round(rc.target_trips_per_truck_per_day * 10) / 10).toFixed(1) : ct.trips_per_truck_target
    const tatTarget = rc?.target_tat_min ?? dx.tat_target
    children.push(new Paragraph({ spacing: { before: 80, after: 20 }, children: [
      new TextRun({ text: `Contribution margin: $${capMargin}/m\u00B3. Trips per truck: ${tripsActual} actual vs ${tripsTarget} at target TAT of ~${tatTarget} min.`, size: SZ_SMALL, font: FONT, color: GRAY, italics: true }),
    ]}))
    children.push(new Paragraph({ spacing: { after: 60 }, children: [
      new TextRun({ text: 'Figures rounded to nearest $1,000. Totals may vary by $1,000 due to rounding.', size: SZ_SMALL, font: FONT, color: GRAY, italics: true }),
    ]}))

    // ── BREAKDOWN 3: Gap calculation ──
    if (isPre && rc && reportInput) {
      const dailyGap = Math.max(0, rc.target_daily_output_m3 - rc.actual_daily_output_m3)
      const annualGap = dailyGap * reportInput.operating_days_per_year
      const monthlyGapDisplay = Math.round(annualGap / 12)

      children.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [
        new TextRun({ text: 'Gap calculation', bold: true, size: SZ_BODY, font: FONT, color: DARK }),
      ]}))
      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [5400, 4440],
        rows: [
          new TableRow({ children: [
            cell('Average load per trip', { width: 5400 }),
            cell(`${rc.avg_load_m3.toFixed(2)} m\u00B3`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Target daily output', { width: 5400 }),
            cell(`${rc.target_daily_output_m3.toLocaleString('en-US')} m\u00B3`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Actual daily output', { width: 5400 }),
            cell(`${rc.actual_daily_output_m3.toLocaleString('en-US')} m\u00B3`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Daily output gap', { width: 5400 }),
            cell(`${dailyGap.toLocaleString('en-US')} m\u00B3`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Operating days per year', { width: 5400 }),
            cell(`${reportInput.operating_days_per_year}`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Annual output gap', { width: 5400 }),
            cell(`${annualGap.toLocaleString('en-US')} m\u00B3`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Monthly output gap', { width: 5400 }),
            cell(`~${monthlyGapDisplay.toLocaleString('en-US')} m\u00B3`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Material contribution per m\u00B3', { width: 5400 }),
            cell(`$${rc.contribution_margin_per_m3.toFixed(2)}`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Full monthly gap', { width: 5400, bold: true, bg: LIGHT }),
            cell(`~${fmt(rc.monthly_gap_usd)}`, { width: 4440, align: AlignmentType.RIGHT, bold: true, bg: LIGHT, color: GREEN }),
          ]}),
        ],
      }))
      children.push(new Paragraph({ spacing: { before: 40, after: 120 }, children: [
        new TextRun({ text: 'Monthly figure is an annual average. Actual gap varies by season and demand. Average load per trip assumes current load per trip remains consistent at target performance.', size: SZ_SMALL, font: FONT, color: GRAY, italics: true }),
      ]}))
    }

    // ── BREAKDOWN 4: Recovery range basis ──
    if (isPre && rc && reportInput) {
      children.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [
        new TextRun({ text: 'Recovery range basis', bold: true, size: SZ_BODY, font: FONT, color: DARK }),
      ]}))
      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [5400, 4440],
        rows: [
          new TableRow({ children: [
            cell('Full monthly gap', { width: 5400 }),
            cell(`~${fmt(rc.monthly_gap_usd)}`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Execution range', { width: 5400 }),
            cell('40-65%', { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Recovery low', { width: 5400 }),
            cell(`~${fmt(rc.recovery_low_usd)}`, { width: 4440, align: AlignmentType.RIGHT }),
          ]}),
          new TableRow({ children: [
            cell('Recovery high', { width: 5400, bold: true, bg: LIGHT }),
            cell(`~${fmt(rc.recovery_high_usd)}`, { width: 4440, align: AlignmentType.RIGHT, bold: true, bg: LIGHT, color: GREEN }),
          ]}),
        ],
      }))
      children.push(new Paragraph({ spacing: { before: 40, after: 120 }, children: [
        new TextRun({ text: 'Planning range based on professional judgement. Operational changes rarely capture the full gap. Structural constraints, customer dependencies, and implementation time all limit recovery.', size: SZ_SMALL, font: FONT, color: GRAY, italics: true }),
      ]}))
    }

    // 6. Where the gap sits (Loss Breakdown)
    {
      const lbRows = rc
        ? [
            { dim: 'Production', amount: rc.production_loss_usd, type: 'Cycle time exceeds target' },
            { dim: 'Quality', amount: rc.quality_loss_usd, type: 'Material cost with no delivery' },
            { dim: 'Dispatch coordination', amount: rc.dispatch_loss_usd, type: 'Cycle time exceeds target' },
          ].filter(r => r.amount > 0)
        : dx.loss_breakdown_detail.map(l => ({
            dim: l.dimension,
            amount: l.amount,
            type: l.dimension === 'Quality' ? 'Material cost with no delivery' : 'Cycle time exceeds target',
          }))

      if (lbRows.length > 0) {
        // Verify sum matches monthly gap
        const lbSum = lbRows.reduce((s, r) => s + r.amount, 0)
        const lbGap = rc?.monthly_gap_usd ?? capMonthlyGap
        if (Math.abs(lbSum - lbGap) > 1000) {
          console.warn('Loss breakdown does not sum to monthly gap:', { production: lbRows[0]?.amount, quality: lbRows[1]?.amount, dispatch: lbRows[2]?.amount, total: lbSum, monthly_gap: lbGap })
        }

        children.push(new Paragraph({ spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION }, children: [
          new TextRun({ text: 'Where the gap sits', bold: true, size: SZ_SUBSECTION, font: FONT, color: DARK }),
        ]}))
        children.push(new Table({
          width: { size: 9840, type: WidthType.DXA }, columnWidths: [4920, 2460, 2460],
          rows: [
            new TableRow({ children: [
              cell('Dimension', { bold: true, bg: LIGHT, width: 4920 }),
              cell('Amount', { bold: true, bg: LIGHT, width: 2460, align: AlignmentType.CENTER }),
              cell('Type', { bold: true, bg: LIGHT, width: 2460, align: AlignmentType.CENTER }),
            ]}),
            ...lbRows.map(r => new TableRow({ children: [
              cell(r.dim, { width: 4920 }),
              cell(`${fmt(r.amount)}/month`, { width: 2460, align: AlignmentType.CENTER }),
              cell(r.type, { width: 2460, align: AlignmentType.CENTER, color: GRAY }),
            ]})),
          ],
        }))
      }
      const lossTotal = rc?.monthly_gap_usd ?? lbRows.reduce((s, r) => s + r.amount, 0)
      children.push(new Paragraph({ spacing: { before: 60, after: 40 }, children: [
        new TextRun({ text: `"Cycle time exceeds target": trips not completed due to turnaround exceeding benchmark. "Material cost with no delivery": waste costs that add up independently. Total identified: ${fmt(lossTotal)}/month. Figures rounded to nearest $1,000.`, size: SZ_SMALL, font: FONT, color: GRAY }),
      ]}))
    }

    // ════════════════════════════════════════════════════════════════════
    // REGULATORY CAVEAT (only when external constraint detected)
    // ════════════════════════════════════════════════════════════════════
    if (isPre && rc?.has_external_constraint && rc.regulatory_scenario) {
      const reg = rc.regulatory_scenario
      const AMBER_BG = 'FEF9E7'
      const AMBER_BORDER = 'F9E79F'

      children.push(new Paragraph({ spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION }, children: [
        new TextRun({ text: 'Current regulatory environment', bold: true, size: SZ_SUBSECTION, font: FONT, color: DARK }),
      ]}))

      children.push(new Table({
        width: { size: 9840, type: WidthType.DXA }, columnWidths: [9840],
        rows: [new TableRow({ children: [new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 1, color: AMBER_BORDER }, bottom: { style: BorderStyle.SINGLE, size: 1, color: AMBER_BORDER }, left: { style: BorderStyle.SINGLE, size: 6, color: AMBER }, right: { style: BorderStyle.SINGLE, size: 1, color: AMBER_BORDER } },
          shading: { fill: AMBER_BG, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          width: { size: 9840, type: WidthType.DXA },
          children: [
            new Paragraph({ children: [
              new TextRun({ text: 'Riyadh\'s truck movement restrictions currently reduce effective daily operating capacity. Under current conditions, near-term recovery is estimated at ', size: SZ_BODY, font: FONT }),
              new TextRun({ text: `${fmt(reg.recovery_low_usd)} - ${fmt(reg.recovery_high_usd)}`, bold: true, size: SZ_BODY, font: FONT, color: GREEN }),
              new TextRun({ text: ' per month \u2014 the portion achievable within the existing regulatory framework.', size: SZ_BODY, font: FONT }),
            ]}),
            new Paragraph({ spacing: { before: 80 }, children: [
              new TextRun({ text: 'The on-site assessment will quantify the exact restriction impact and identify which improvements can be implemented immediately versus those contingent on regulatory changes.', size: SZ_BODY, font: FONT }),
            ]}),
            new Paragraph({ spacing: { before: 60 }, children: [
              new TextRun({ text: reg.basis, size: SZ_SMALL, font: FONT, color: GRAY, italics: true }),
            ]}),
          ],
        })] })],
      }))
    }

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
        new TextRun({ text: `Value-adding: ${vs.va_minutes} min (${vs.va_pct}%)  |  `, size: SZ_SMALL, font: FONT, color: GREEN }),
        new TextRun({ text: `Necessary NVA: ${vs.necessary_nva_minutes} min (${vs.necessary_nva_pct}%)  |  `, size: SZ_SMALL, font: FONT, color: AMBER }),
        new TextRun({ text: `Pure waste: ${vs.nva_minutes} min (${vs.nva_pct}%)`, size: SZ_SMALL, font: FONT, color: 'CC3333' }),
      ]}))
    } else if (dx.tat_breakdown && dx.tat_breakdown.length > 0) {
      // Fallback: TAT breakdown from assessment answers
      children.push(new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: '(Assessor-reported, not measured)', size: SZ_SMALL, font: FONT, color: AMBER, italics: true }),
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
        new TextRun({ text: `TAT range: ${tv.min}-${tv.max} min  |  Std deviation: ${tv.std_dev} min  |  P25/P75: ${tv.p25}/${tv.p75} min`, size: SZ_SMALL, font: FONT, color: DARK }),
      ]}))
      if (tv.std_dev > 20) {
        children.push(new Paragraph({ children: [
          new TextRun({ text: 'High variation (std dev > 20 min) indicates systemic instability.', size: SZ_SMALL, font: FONT, color: 'CC3333', bold: true }),
        ]}))
      }
    }
    } // end if (hasVSMData)

    // ════════════════════════════════════════════════════════════════════
    // SECTION 4: ROOT CAUSE ANALYSIS (on-site only, removed from pre-assessment)
    // ════════════════════════════════════════════════════════════════════
    if (!isPre) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...sectionHeader('Root Cause Analysis', 'Operations Section'))

    if (report?.diagnosis) {
      let diagText = sanitize(report.diagnosis).replace(/^#{1,3}\s*(Preliminary Analysis|Root Cause Analysis|Constraint Analysis)\s*\n+/i, '')
      diagText = stripUnauthorizedHeadings(diagText, ['Loss Breakdown'])
      children.push(...textParas(diagText))
    } else {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: 'Report not yet generated. Click "Generate report" in the platform before exporting.', size: SZ_SMALL, font: FONT, color: AMBER, italics: true }),
      ]}))
    }
    } // end !isPre for Root Cause Analysis

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
          children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: nc, size: SZ_BODY, font: FONT })] }))
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // SECTION 6: RECOMMENDATIONS (on-site only, removed from pre-assessment)
    // ════════════════════════════════════════════════════════════════════
    if (!isPre) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...sectionHeader('Recommendations', 'Operations Section'))

    // Priority matrix table (on-site only, when matrix available)
    if (matrix && matrix.rows.length > 0) {
      children.push(new Paragraph({ spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION }, children: [new TextRun({ text: 'Priority Matrix', bold: true, size: SZ_SUBSECTION, font: FONT, color: DARK })] }))

      for (const q of ['DO_FIRST', 'PLAN_CAREFULLY', 'QUICK_WIN', 'DONT_DO'] as Quadrant[]) {
        const qRows = matrix.rows.filter(r => r.quadrant === q)
        if (qRows.length === 0) continue

        children.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: [
          new TextRun({ text: QUADRANT_LABELS[q] || q, bold: true, size: SZ_BODY, font: FONT, color: q === 'DO_FIRST' ? GREEN : q === 'PLAN_CAREFULLY' ? AMBER : GRAY }),
        ]}))

        for (const row of qRows) {
          const overrideNote = row.quadrant_source === 'consultant' && row.override_reason ? ` * ${row.override_reason}` : ''
          children.push(new Paragraph({ spacing: { after: 40 }, indent: { left: 360 }, children: [
            new TextRun({ text: `${row.issue_title.slice(0, 70)}`, bold: true, size: SZ_TABLE, font: FONT }),
            new TextRun({ text: ` - ${row.constraint_note || `${fmtK(row.loss_addressed)}/mo`} (${(row.impact_score * 100).toFixed(0)}% impact) - ${row.urgency} - ${row.org_level}${overrideNote}`, size: SZ_SMALL, font: FONT, color: GRAY }),
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
        new TextRun({ text: 'Report not yet generated. Click "Generate report" in the platform before exporting.', size: SZ_SMALL, font: FONT, color: AMBER, italics: true }),
      ]}))
    }
    } // end !isPre for Recommendations

    // ════════════════════════════════════════════════════════════════════
    // NEXT STEP (pre-assessment: extract from AI actions text)
    // ════════════════════════════════════════════════════════════════════
    if (isPre && report?.actions) {
      children.push(new Paragraph({ spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION }, children: [
        new TextRun({ text: 'Next Step', bold: true, size: SZ_SUBSECTION, font: FONT, color: DARK }),
      ]}))
      // Extract the Next Step portion from AI actions text (everything after "## Next Step" heading)
      const actionsText = sanitize(report.actions)
      const nextStepMatch = actionsText.match(/##\s*Next\s*Step\s*\n+([\s\S]*?)(?=##|$)/i)
      if (nextStepMatch) {
        children.push(...textParas(nextStepMatch[1].trim()))
      } else {
        // Fallback: use the last paragraph of the actions text
        const paras = actionsText.split(/\n{2,}/).filter(p => p.trim())
        if (paras.length > 0) {
          children.push(...textParas(paras[paras.length - 1].trim()))
        }
      }
    }

    // Fleet note for large multi-plant deployments with external constraints
    if (isPre && rc?.has_external_constraint && reportInput && reportInput.trucks_assigned >= 50 && !inserted.has('fleet-note')) {
      inserted.add('fleet-note')
      children.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [
        new TextRun({ text: `Note: figures reflect combined performance across all plant locations and all ${reportInput.trucks_assigned} trucks operating under central dispatch.`, size: SZ_BODY, font: FONT, color: GREEN, italics: true }),
      ]}))
    }

    // Fixed closing line (not AI-generated)
    if (isPre && !inserted.has('48h-invitation')) {
      inserted.add('48h-invitation')
      children.push(new Paragraph({ spacing: { before: 200, after: 60 }, border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'D4EDDA', space: 8 } }, children: [
        new TextRun({ text: 'The on-site assessment typically takes 3-5 days. If you would like to proceed, I can have a scope and timeline to you within 48 hours.', size: SZ_BODY, font: FONT, color: GREEN, italics: true }),
      ]}))
    }

    // Sign-off block — consultant identity
    if (!inserted.has('sign-off')) {
      inserted.add('sign-off')
      children.push(new Paragraph({ spacing: { before: 300 }, border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC', space: 8 } }, children: [] }))
      // TODO: Replace text logo with ImageRun when /public/al-cem-logo.png is added
      children.push(new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: 'Al-Cem', font: FONT, size: SZ_SUBSECTION, bold: true, color: GREEN }),
      ]}))
      children.push(new Paragraph({ spacing: { after: 20 }, children: [
        new TextRun({ text: 'Louis Hellmann', font: FONT, size: SZ_BODY, bold: true, color: DARK }),
      ]}))
      children.push(new Paragraph({ spacing: { after: 20 }, children: [
        new TextRun({ text: 'Operational Excellence Consultant', font: FONT, size: SZ_SMALL, color: GRAY }),
      ]}))
      children.push(new Paragraph({ spacing: { after: 20 }, children: [
        new TextRun({ text: 'Al-Cem', font: FONT, size: SZ_SMALL, color: GRAY }),
      ]}))
      children.push(new Paragraph({ spacing: { after: 20 }, children: [
        new TextRun({ text: 'Louishellmann@gmail.com  |  +45 20 91 29 11', font: FONT, size: SZ_SMALL, color: GRAY }),
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
          new TextRun({ text: `Fix the constraint first. The primary constraint is ${dx.main_driver.dimension || dx.primary_constraint}. Do not optimize rejection rate, fleet size, or plant capacity until turnaround time is moving toward the ${dx.tat_target}-min target. Optimizing non-constraints wastes resources.`, size: SZ_BODY, font: FONT }),
        ]}))

        if (matrix) {
          const capitalItems = matrix.rows.filter(r => issues?.find(i => i.t === r.issue_title)?.complexity?.requires_capital)
          const contractItems = matrix.rows.filter(r => issues?.find(i => i.t === r.issue_title)?.complexity?.requires_contract_change)
          if (capitalItems.length > 0) {
            children.push(new Paragraph({ spacing: { after: 80 }, children: [
              new TextRun({ text: `Capital requirements: ${capitalItems.length} recommendation(s) require investment. Review these in the Plan Carefully quadrant before committing budget.`, size: SZ_BODY, font: FONT }),
            ]}))
          }
          if (contractItems.length > 0) {
            children.push(new Paragraph({ spacing: { after: 80 }, children: [
              new TextRun({ text: `Contract changes: ${contractItems.length} recommendation(s) require contract modifications (demurrage, liability). Initiate commercial discussions early as these have the longest lead time.`, size: SZ_BODY, font: FONT }),
            ]}))
          }
        }

        children.push(new Paragraph({ spacing: { after: 80 }, children: [
          new TextRun({ text: 'Each action requires a confirmed owner and start date assigned by plant management before implementation begins.', size: SZ_BODY, font: FONT, bold: true }),
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
        new TextRun({ text: `Assessment basis: ${flc.total_trips_observed} observed truck cycles, ${flc.days_observed} working days`, size: SZ_SMALL, font: FONT, color: DARK }),
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
          new TextRun({ text: 'Normal: < 110% of fleet avg  |  Watch: 110-130%  |  Outlier: > 130%', size: SZ_SMALL, font: FONT, color: GRAY }),
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
            new TextRun({ text: `${intv.date} - ${intv.title}`, bold: true, size: SZ_TABLE, font: FONT }),
          ]}))
          if (intv.target_metric) {
            children.push(new Paragraph({ indent: { left: 360 }, children: [
              new TextRun({ text: `Target: ${intv.target_metric}`, size: SZ_SMALL, font: FONT, color: GRAY }),
            ]}))
          }
          if (intv.avg_tat_before != null && intv.avg_tat_after != null) {
            children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 60 }, children: [
              new TextRun({ text: `TAT before: ${intv.avg_tat_before} min \u2192 after: ${intv.avg_tat_after} min (${intv.approximate ? 'approximate' : 'confirmed'})`, size: SZ_SMALL, font: FONT, color: intv.avg_tat_after < intv.avg_tat_before ? GREEN : 'CC3333' }),
            ]}))
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // FOOTER — date only, no platform references
    // ════════════════════════════════════════════════════════════════════
    children.push(new Paragraph({ spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC', space: 8 } }, children: [
      new TextRun({ text: dateStr, color: GRAY, font: FONT, size: SZ_SMALL }),
    ]}))

    // ════════════════════════════════════════════════════════════════════
    // BUILD DOCUMENT
    // ════════════════════════════════════════════════════════════════════
    const doc = new Document({
      styles: {
        default: { document: { run: { font: FONT, size: SZ_BODY, color: DARK } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: SZ_SECTION, bold: true, font: FONT, color: DARK },
            paragraph: { spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION }, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: SZ_SUBSECTION, bold: true, font: FONT, color: DARK },
            paragraph: { spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION }, outlineLevel: 1 } },
        ],
      },
      sections: [{
        properties: {
          // Page: Letter size, margins: top/bottom 2.5cm (1417tw), left/right 2.8cm (1587tw)
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1417, right: 1587, bottom: 1417, left: 1587 } },
        },
        headers: {
          default: new Header({ children: [new Paragraph({ children: [
            new TextRun({ text: 'Al-Cem', bold: true, color: GREEN, font: FONT, size: SZ_SMALL }),
            new TextRun({ text: `  |  ${reportType}`, color: GRAY, font: FONT, size: SZ_SMALL }),
          ]})] }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: 'Confidential  |  Page ', color: GRAY, font: FONT, size: SZ_SMALL }),
            new TextRun({ children: [PageNumber.CURRENT], color: GRAY, font: FONT, size: SZ_SMALL }),
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
