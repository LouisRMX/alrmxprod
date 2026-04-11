import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { NextRequest, NextResponse } from 'next/server'
import type { ValidatedDiagnosis } from '@/lib/diagnosis-pipeline'
import type { Answers } from '@/lib/calculations'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

interface BenchmarkContext {
  n: number
  turnaround: { p25: number; p50: number; p75: number }
  dispatch:   { p25: number; p50: number; p75: number }
  reject:     { p25: number; p50: number; p75: number }
  deliveries: { p50: number }
}

// 10 report generations per user per minute
const RATE_LIMIT = { maxRequests: 10, windowSeconds: 60 }

export async function POST(req: NextRequest) {
  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before making more requests.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  const spend = checkSpendCap(user.id)
  if (!spend.allowed) {
    return NextResponse.json(
      { error: `Daily AI budget reached ($${spend.dailyCap}/day). Resets in 24 hours.` },
      { status: 429 }
    )
  }

  const { assessmentId, type, context, demoOverride } = await req.json()
  if (!assessmentId || !type || !context) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Extract ValidatedDiagnosis, raw answers, and phase from context
  const dx = context.dx as ValidatedDiagnosis | undefined
  const answers = (context.answers ?? {}) as Answers
  const phase = (context.phase ?? 'onsite') as string

  // Demo mode: return fixed pre-written report text, no database access needed
  // Skip when demoOverride === true (user has changed inputs and wants a live generation)
  if (assessmentId === 'demo' && !demoOverride) {
    const DEMO_TEXTS: Record<string, string> = {
      executive: `Turnaround time at an estimated 112 minutes is 28 minutes above the 84-minute target for suburban Saudi delivery zones. This excess compresses the number of trips each truck can complete per shift. At 20 trucks averaging 5.4 trips per day instead of the achievable 7.1, the fleet delivers roughly 500 m3/day against a target of 690 m3/day.

The plant manager identifies trucks stuck at construction sites during morning peak as the primary challenge. This is consistent with the turnaround data: when trucks arrive at sites without coordinated timing, site queuing extends every cycle. Dispatch is managed via spreadsheet and WhatsApp, meaning each departure depends on manual coordination rather than a pre-planned sequence. This is the mechanism that inflates turnaround, not a separate problem.

The 28-minute turnaround excess is the single driver of the throughput gap. Rejection rate at 3.5% adds material cost but does not constrain how many trips the fleet completes. Utilisation at 67% is the mathematical result of a 112-minute cycle with this fleet size, not an independent cause. Reducing turnaround time is the lever that unlocks both more volume and higher utilisation simultaneously.`,

      diagnosis: `The data points toward fleet turnaround as the likely constraint. Each truck completes 5.4 trips per day against an achievable 7.1 at target turnaround. That difference, 1.7 trips per truck across 20 trucks, represents the core of the throughput gap. Utilisation at 67% is what a 112-minute cycle produces with this fleet. It is a consequence, not a separate problem.

Rejection rate at 3.5% is above the 3% target but does not constrain throughput. Material cost from rejections adds to operational leakage but fixing rejection alone would not increase the number of deliveries per day. The binding limit is how often each truck moves, not what happens to individual loads.

The on-site assessment will determine: where in the 112-minute cycle the time is physically lost (plant queue, site wait, or uncoordinated dispatch timing); whether the turnaround excess is consistent across all shifts or concentrated in peak hours; and whether the fleet constraint is purely a turnaround issue or partly driven by truck availability. These questions require direct observation.`,

      actions: `Before the on-site visit

1. Log truck departure and return times for one full week: Note when each truck leaves the plant loaded and when it returns empty. This is the raw data needed to calculate actual turnaround per trip, not an average.

2. Pull rejection records for the last 3 months: Gather any records of returned or rejected loads. Note the date, cause, and contractor. This separates plant-side quality issues from customer-site problems.

3. Collect one week of delivery tickets: Keep copies of all delivery tickets from one typical working week. These show departure times, arrival times, and volumes per trip.

4. Ask the dispatcher to note plant queue times: For one week, log when each truck arrives back at the plant and when it starts loading. This reveals how much of the cycle is spent waiting at the plant gate.

5. Identify your 3 highest-volume delivery sites this month: These are the sites where cycle time improvements will have the most impact. Note their distance from the plant and any known queuing issues.

Next Step
This pre-assessment has established, based on reported data, that the plant has an estimated $33k-$53k per month in recoverable margin. This figure is derived from the gap between actual fleet output (5.4 trips/truck/day) and target output (7.1 trips/truck/day at 84-minute turnaround), multiplied by the plant's $20/m3 contribution margin, with a 40-65% execution range applied. Current utilisation at 67% is what a 112-minute turnaround produces with this fleet size. It is a symptom, not a separate cause. What this assessment cannot confirm is where in the 112-minute cycle the time is physically lost, or whether the excess is consistent across shifts or concentrated in peak hours. An on-site assessment of approximately 4 weeks will convert this preliminary view into a validated diagnosis with confirmed constraint identification and a prioritized action plan.`,
    }
    const text = DEMO_TEXTS[type]
    if (!text) return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    // Stream demo text in chunks to simulate generation
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const words = text.split(' ')
        for (let i = 0; i < words.length; i += 4) {
          const chunk = words.slice(i, i + 4).join(' ') + (i + 4 < words.length ? ' ' : '')
          controller.enqueue(encoder.encode(chunk))
          await new Promise(resolve => setTimeout(resolve, 18))
        }
        controller.close()
      }
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  // Verify assessment exists and user has access (skipped for demo override, no DB record)
  if (assessmentId !== 'demo') {
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id')
      .eq('id', assessmentId)
      .single()

    if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  // Fetch anonymized benchmark percentiles for comparable plants (N ≥ 5 required for AI injection)
  let benchmarks: BenchmarkContext | null = null
  if (context.radiusBucket && context.fleetBucket) {
    const { data: bData } = await supabase.rpc('get_plant_percentiles', {
      p_radius_bucket: context.radiusBucket as string,
      p_fleet_bucket:  context.fleetBucket as string,
      p_exclude_id:    assessmentId,
    })
    if (bData && (bData as BenchmarkContext).n >= 5) {
      benchmarks = bData as BenchmarkContext
    }
  }

  // dx may be undefined for very old assessments or edge cases; fall back gracefully
  if (!dx) {
    return NextResponse.json({ error: 'ValidatedDiagnosis missing from context' }, { status: 400 })
  }

  const prompts: Record<string, string> = {
    executive: buildExecutivePrompt(dx, answers, phase, benchmarks),
    diagnosis: buildDiagnosisPrompt(dx, answers, phase, benchmarks),
    actions: buildActionsPrompt(dx, answers, phase),
  }

  const prompt = prompts[type]
  if (!prompt) return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })

  // Stream the response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        })

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }

        trackSpend(user.id)

        // Save to database when complete, skipped for demo override (no persistent record)
        if (assessmentId !== 'demo') {
          const fullText = stripMarkdown(await response.finalText())
          await supabase.from('reports').upsert({
            assessment_id: assessmentId,
            [type]: fullText,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'assessment_id' })
        }

        controller.close()
      } catch (err) {
        controller.error(err)
      }
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

function buildMarketContext(b: BenchmarkContext): string {
  return `
MARKET CONTEXT (${b.n} comparable plants, similar fleet size and delivery radius):
Turnaround, median: ${b.turnaround.p50} min · top quartile: ${b.turnaround.p25} min
Dispatch  , median: ${b.dispatch.p50} min · top quartile: ${b.dispatch.p25} min
Rejection , median: ${b.reject.p50}% · top quartile: ${b.reject.p25}%

When this data is available, reference the plant's position relative to comparable operations. Use language like "comparable plants" or "similar operations in this segment". Do not call it an "industry average". Be direct: if the plant is below median on a key metric, state it.`
}

// ══════════════════════════════════════════════════════════════════════════
// FEW-SHOT EXAMPLES (from validated v2 pre-assessment report)
// ══════════════════════════════════════════════════════════════════════════

const EXAMPLE_EXECUTIVE = `EXAMPLE OF TARGET QUALITY — match this tone, structure, and level of specificity. Do not copy content. Use it as a calibration standard only.

"Turnaround time at an estimated 112 minutes is 28 minutes above the 84-minute target for suburban Saudi delivery zones. This excess compresses the number of trips each truck can complete per shift. At 20 trucks averaging 5.4 trips per day instead of the achievable 7.1, the fleet delivers roughly 500 m3/day against a target of 690 m3/day.

The plant manager identifies trucks stuck at construction sites during morning peak as the primary challenge. This is consistent with the turnaround data: when trucks arrive at sites without coordinated timing, site queuing extends every cycle. Dispatch coordination via spreadsheet and WhatsApp is the mechanism that inflates turnaround, not a separate problem.

The 28-minute turnaround excess is the single driver of the throughput gap. Rejection rate at 3.5% adds material cost but does not constrain how many trips the fleet completes. Utilisation at 67% is the mathematical result of a 112-minute cycle with this fleet size, not an independent cause."

END OF EXAMPLE`

const EXAMPLE_DIAGNOSIS = `EXAMPLE OF TARGET QUALITY — match this tone, structure, and level of specificity. Do not copy content. Use it as a calibration standard only.

"The data points toward fleet turnaround as the likely constraint. Each truck completes 5.4 trips per day against an achievable 7.1 at target turnaround. That difference, 1.7 trips per truck across 20 trucks, represents the core of the throughput gap. Utilisation at 67% is what a 112-minute cycle produces with this fleet. It is a consequence, not a separate problem.

Rejection rate at 3.5% sits above the 3% target and adds direct material cost per rejected load, but it does not limit throughput. Each rejection is an additive cost, it does not block the next delivery cycle. The throughput gap is driven by turnaround time. Fixing turnaround recovers volume. Fixing rejection recovers material cost. Both matter, but they are separate levers.

The on-site assessment will determine: where in the 112-minute cycle the time is physically lost (plant queue, site wait, or uncoordinated dispatch timing); whether the excess is consistent across shifts or concentrated in peak hours; and whether the fleet constraint is purely turnaround or partly truck availability."

END OF EXAMPLE`

const EXAMPLE_ACTIONS = `EXAMPLE OF TARGET QUALITY — match this tone, structure, and level of specificity. Do not copy content. Use it as a calibration standard only.

"Before the on-site visit

1. Log truck departure and return times for one full week: Note when each truck leaves loaded and returns empty. This is the raw data needed to calculate actual turnaround per trip.

2. Pull rejection records for the last 3 months: Gather records of returned or rejected loads. Note date, cause, and contractor. This separates plant-side quality issues from customer-site problems.

3. Collect one week of delivery tickets: Keep copies from one typical working week. These show departure times, arrival times, and volumes per trip.

4. Ask the dispatcher to note plant queue times: For one week, log when each truck arrives back at the plant and when it starts loading. This reveals plant-side waiting time.

5. Identify your 3 highest-volume delivery sites this month: These are where cycle time improvements have the most impact.

Next Step
This pre-assessment has established that the plant has an estimated $33k-$53k per month in recoverable margin. This figure is derived from the gap between actual fleet output (5.4 trips/truck/day) and target output (7.1 trips/truck/day), multiplied by $20/m3 contribution margin, with a 40-65% execution range. Current utilisation at 67% is what a 112-minute turnaround produces. It is a symptom, not a cause. An on-site assessment will convert this preliminary view into a validated diagnosis."

END OF EXAMPLE`

// ══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

// ── TAT breakdown: reads from ValidatedDiagnosis.tat_breakdown (pre-validated by pipeline) ──
function buildTATBreakdown(dx: ValidatedDiagnosis): string {
  if (!dx.tat_breakdown || dx.tat_breakdown.length === 0) return ''

  const largest = [...dx.tat_breakdown].sort((a, b) => b.actual - a.actual)[0]
  const total = dx.tat_breakdown.reduce((s, c) => s + c.actual, 0)

  return `TAT breakdown (on-site measurement):
${dx.tat_breakdown.map(c => `  ${c.label}: ${c.actual} min (benchmark: ${c.benchmark} min)`).join('\n')}
  Component total: ${total} min (reported TAT: ${dx.tat_actual} min)
  Largest component: ${largest.label} (${largest.actual} min)
The TAT component breakdown is more precise than the dropdown-derived total. Name the dominant component directly and specifically.`
}

// ── Plant idle signal: reads raw answer field ──
// TODO: plant_idle, route_clustering, order_notice should be extracted
// into ValidatedDiagnosis by the pipeline. When that is done, this
// answers parameter can be removed and helpers migrate fully to dx.
function buildIdleSignal(answers: Answers): string {
  const idle = answers?.plant_idle as string | null
  if (!idle) return ''

  const isNever = idle.toLowerCase().includes('never')
  if (isNever) return `Plant idle signal: plant does not report waiting for trucks. This does not rule out fleet constraint but reduces its likelihood.`

  const isRegular = idle.toLowerCase().includes('regularly') || idle.toLowerCase().includes('every day')
  if (isRegular) return `Plant idle signal: plant reports sitting ready with no truck available regularly. This confirms fleet is the binding constraint, not production capacity. Reference this directly when explaining the constraint mechanism.`

  const isOccasional = idle.toLowerCase().includes('occasionally')
  if (isOccasional) return `Plant idle signal: plant reports occasionally waiting for trucks (a few times per week). This suggests fleet may be the binding constraint during peak periods.`

  return ''
}

// ── Pain context: reads from ValidatedDiagnosis.management_context ──
function buildPainContext(dx: ValidatedDiagnosis): string {
  const pain = dx.management_context
  if (!pain || pain.trim().length < 10) return ''

  return `Plant manager's stated challenge: "${pain}"
Note: This is self-reported and may describe a symptom rather than the root cause. Use it to make the actions section feel plant-specific. If it contradicts the diagnostic findings, briefly acknowledge the tension. Paraphrase the concern in the report. Do not repeat exact phrasing from the input.`
}

// ── Dispatch context: reads raw answer fields ──
// TODO: plant_idle, route_clustering, order_notice should be extracted
// into ValidatedDiagnosis by the pipeline. When that is done, this
// answers parameter can be removed and helpers migrate fully to dx.
function buildDispatchContext(answers: Answers): string {
  const clustering = answers?.route_clustering as string | null
  const notice = answers?.order_notice as string | null

  if (!clustering && !notice) return ''

  const lines = []
  if (clustering) lines.push(`Route clustering: ${clustering}`)
  if (notice) lines.push(`Customer order notice: ${notice}`)
  lines.push(`Note: Use these to explain the structural cause of dispatch delays. If clustering is absent and notice is short, the dispatch system is reactive by design.`)

  return lines.join('\n')
}

// ── Clustering signal for actions: reads raw answer field ──
// TODO: plant_idle, route_clustering, order_notice should be extracted
// into ValidatedDiagnosis by the pipeline. When that is done, this
// answers parameter can be removed and helpers migrate fully to dx.
function buildClusteringSignal(answers: Answers): string {
  const clustering = answers?.route_clustering as string | null
  if (!clustering) return ''

  const absent = clustering.toLowerCase().includes('sometimes') ||
                 clustering.toLowerCase().includes('rarely')
  if (!absent) return ''

  return `Route clustering: ${clustering}.
Note: Zone-based dispatch grouping is a zero-cost immediate action. Include it in the immediate actions section if dispatch is the primary constraint. Frame it as a concrete protocol, not a general suggestion.`
}

// ══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ══════════════════════════════════════════════════════════════════════════

function buildExecutivePrompt(dx: ValidatedDiagnosis, answers: Answers, phase: string, benchmarks: BenchmarkContext | null = null) {
  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes, no numbered lists.
- Never invent data. Use only the figures provided.
- Do NOT repeat revenue figures or bullet metrics, those are already shown above this text in the UI.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive.
- Short sentences. One idea per sentence.
- If this text could apply to any ready-mix plant, it is too generic. Rewrite until it is specific to this plant.
- All analysis is based on reported input data. Do not present conclusions as absolute facts.
- Use observed_signals as confirmed facts. Use inferred_signals as interpretations: frame with "suggests", "indicates", "points to". Never present inferred signals as observed facts.
- Do not present utilisation as an independent cause. It is always the consequence of turnaround and fleet size combined.
- If TAT breakdown is absent: do not speculate on which component drives the turnaround excess.
- Never use first person plural. Do not write "we". Write in third person or address the plant directly.`

  const performingWell = dx.total_loss === 0 && dx.actions.length === 0 && dx.data_quality !== 'insufficient'

  if (performingWell) {
    return `${RULES}

You are writing a short operational explanation for a well-performing ready-mix concrete plant.

PLANT DATA:
Plant: ${dx.plant_name}, ${dx.country}
Utilisation: ${dx.utilization_pct}% (target: 85%) | Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)

WRITE THREE SHORT PARAGRAPHS, no headings, no labels:
Paragraph 1: What the data shows about operational flow and what that implies about how the plant is run.
Paragraph 2: Why this level of performance holds. What operational habits are keeping these metrics stable.
Paragraph 3: What to monitor. One or two areas that could slip if not actively maintained.`
  }

  // ── PRE-ASSESSMENT EXECUTIVE ──
  if (phase === 'workshop') {
    const lo = dx.total_loss_range?.lo ?? Math.round(dx.total_loss * 0.7)
    const hi = dx.total_loss_range?.hi ?? Math.round(dx.total_loss * 1.3)
    return `${RULES}

You are writing the initial analysis section of a Pre-Assessment Report for ${dx.plant_name} in ${dx.country}.
This is based on self-reported data collected remotely. No on-site verification.

${EXAMPLE_EXECUTIVE}

CRITICAL CONSTRAINTS FOR PRE-ASSESSMENT:
- All figures are directional estimates, not confirmed values.
- Do NOT name a definitive constraint. Say "the data points toward [area] as the likely driver, to be confirmed on-site."
- Do NOT reference TAT component breakdown (site wait, transit split).
- Use ranges: "between $${Math.round(lo / 1000)}k and $${Math.round(hi / 1000)}k per month".
- Frame all findings as preliminary.

PLANT DATA (self-reported, not verified):
Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)
${dx.management_context ? `Plant manager's stated challenge: "${dx.management_context}"
Note: Reference this in paragraph 1 to anchor the opening in what the plant already observes. Paraphrase, do not quote verbatim.` : ''}
Dispatch coordination: managed via ${dx.performance_gaps['dispatch'] ? 'manual tools' : 'unknown method'} (dispatch is a mechanism that explains WHY turnaround is high, not a separate metric)
Rejection rate: ${dx.reject_pct}% (target: <3%)
Utilisation: ${dx.utilization_pct}% (target: 85%) — consequence of turnaround and fleet size, not an independent cause
Fleet: ${dx.trucks_effective} effective trucks of ${dx.trucks_total} assigned

WRITE EXACTLY TWO PARAGRAPHS. No headings. No bullets.
Paragraph 1: What the reported data suggests about where margin is being lost. Name the likely area but frame as directional. Use actual numbers vs targets. If the plant manager's stated challenge is available, anchor the opening in it.
Paragraph 2: What cannot be determined remotely. Name 2-3 things the on-site assessment will clarify. End with one sentence framing the on-site visit as the logical next step.`
  }

  // ── ON-SITE EXECUTIVE ──
  const tatSection = buildTATBreakdown(dx)
  return `${RULES}

You are writing the Executive Explanation section of a Plant Intelligence Report for ${dx.plant_name} in ${dx.country}.
PURPOSE: Explain WHY the primary constraint occurs and HOW it constrains the operation. Cause-effect logic only.

${EXAMPLE_EXECUTIVE}

PLANT DATA:
Primary constraint: ${dx.primary_constraint}
Confidence: ${dx.confidence} | Claim strength: ${dx.claim_strength}
Claim basis: ${dx.claim_strength_basis}

Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)
${tatSection}
Dispatch coordination: mechanism that explains part of turnaround excess (not a standalone KPI)
${buildDispatchContext(answers)}
Rejection: ${dx.reject_pct}% | Plant-side fraction: ${Math.round(dx.reject_plant_fraction * 100)}%
Utilisation: ${dx.utilization_pct}% (target: 85%) — consequence of turnaround and fleet size, not an independent cause
Fleet: ${dx.trucks_effective} effective trucks of ${dx.trucks_total} assigned

Observed signals: ${dx.observed_signals.join(' · ') || 'none'}
Inferred signals: ${dx.inferred_signals.join(' · ') || 'none'}
${dx.management_context ? `Plant manager's stated challenge: "${dx.management_context}"
Note: Reference this in paragraph 1 to anchor the opening in what the plant already observes. Paraphrase, do not quote verbatim.` : ''}
${buildIdleSignal(answers)}
${benchmarks ? buildMarketContext(benchmarks) : ''}
WRITE EXACTLY THREE PARAGRAPHS. No headings. No bullets. No labels.

COMPRESSION RULES:
- Each paragraph: ONE core idea, ONE cause-effect relationship. Max 2-3 sentences.
- No examples, no storytelling. Start with the operational fact.

Paragraph 1: State the measured gap as fact. Then state the most likely cause, using observed_signals as facts and inferred_signals as interpretations.
Paragraph 2: State the downstream consequence for the system. Use calc_trace numbers (trips per truck, m3/day gap) to make it concrete.
Paragraph 3: Why this is the binding constraint over the others. One sentence per secondary dimension. End confirming why the primary constraint unlocks the most recovery.`
}

function buildDiagnosisPrompt(dx: ValidatedDiagnosis, answers: Answers, phase: string, benchmarks: BenchmarkContext | null = null) {
  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL, frame as "up to $X" or "recoverable", never as confirmed losses.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive.
- Short sentences. One idea per sentence.
- Write for a plant owner who is intelligent and has no patience for consultants.
- Do not present utilisation as an independent cause alongside turnaround. Utilisation is the output of turnaround and fleet size combined.
- The calc_trace is provided so you can explain the mechanism quantitatively. Use the actual numbers to explain what is happening.
- If data_quality is "directional" or flags are present, acknowledge the limitation in one sentence. Do not repeat each flag.
- If TAT breakdown is absent: do not speculate on which component drives the turnaround excess.
- Never use first person plural. Do not write "we". Write in third person or address the plant directly.`

  const performingWell = dx.total_loss === 0 && dx.actions.length === 0 && dx.data_quality !== 'insufficient'

  if (performingWell) {
    return `${RULES}

You are writing the Constraint Analysis section for a well-performing ready-mix concrete plant. No binding constraint was found.

PLANT DATA:
Plant: ${dx.plant_name}, ${dx.country}
Utilisation: ${dx.utilization_pct}% (target: 85%)
Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)

WRITE THREE PARAGRAPHS. No headings. No bullet points.
Paragraph 1: What the operation looks like when no single dimension is constraining throughput. Max 3 sentences.
Paragraph 2: What the metrics indicate about day-to-day discipline. Be specific to the actual numbers.
Paragraph 3: What to monitor. One or two dimensions most likely to slip first.`
  }

  // ── PRE-ASSESSMENT DIAGNOSIS ──
  if (phase === 'workshop') {
    const lo = dx.total_loss_range?.lo ?? Math.round(dx.total_loss * 0.7)
    const hi = dx.total_loss_range?.hi ?? Math.round(dx.total_loss * 1.3)
    const dispatchGap = dx.performance_gaps['dispatch']

    return `${RULES}

You are writing the Preliminary Analysis section of a Pre-Assessment Report for ${dx.plant_name} in ${dx.country}.
This is based on self-reported data collected remotely. No on-site verification.

${EXAMPLE_DIAGNOSIS}

CRITICAL CONSTRAINTS:
- Do NOT reference TAT component breakdown.
- Do NOT name a definitive constraint. Use "likely" or "appears to be".
- Use ranges: "$${Math.round(lo / 1000)}k-$${Math.round(hi / 1000)}k/month".
- Frame all analysis as preliminary.
- Rejection rate is ALWAYS additive leakage, never a throughput constraint. It adds material cost but does not limit how many trips the fleet completes. Never open a paragraph with rejection as the primary finding. Never frame rejection as "the likely constraint." Turnaround time is the throughput driver. Rejection is a cost driver. They are not interchangeable.

PLANT DATA (self-reported, not verified):
Likely constraint area: ${dx.primary_constraint} (to be confirmed on-site)
Estimated recoverable range: $${Math.round(lo / 1000)}k-$${Math.round(hi / 1000)}k/month
Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)
Dispatch coordination: managed via ${dx.performance_gaps['dispatch'] ? 'manual tools' : 'unknown method'} (dispatch is a mechanism that explains WHY turnaround is high, not a separate metric)
Rejection rate: ${dx.reject_pct}% (target: <3%)
Utilisation: ${dx.utilization_pct}% (target: 85%)
Fleet: ${dx.trucks_effective} effective trucks of ${dx.trucks_total} assigned

WRITE EXACTLY TWO PARAGRAPHS. No headings. No bullets.
Paragraph 1: What the numbers suggest about performance. Name the 1-2 dimensions furthest from target. Use actual numbers.
Paragraph 2: What the on-site assessment will determine. Name 2-3 operational questions that can only be answered by observing the plant.`
  }

  // ── ON-SITE DIAGNOSIS ──
  const ct = dx.calc_trace
  const tatSection = buildTATBreakdown(dx)
  const dispatchGap = dx.performance_gaps['dispatch']

  return `${RULES}

You are writing the Constraint Analysis section of a Plant Intelligence Report for ${dx.plant_name} in ${dx.country}.
The reader already knows the bottleneck mechanism. Start from its consequences for the system.

${EXAMPLE_DIAGNOSIS}

PLANT DATA:
Primary constraint: ${dx.primary_constraint}
Verdict cause: ${dx.verdict_cause}
Mechanism: ${dx.mechanism_detail}

Bottleneck loss: up to $${dx.main_driver.amount}/month
Recovery range: $${dx.combined_recovery_range.lo}-$${dx.combined_recovery_range.hi}/month

Calculation trace:
  Fleet daily output: ${ct.fleet_daily_m3} m3/day
  Plant daily capacity: ${ct.plant_daily_m3} m3/day
  Actual daily output: ${ct.actual_daily_m3} m3/day
  Target daily output: ${ct.target_daily_m3} m3/day
  Gap: ${ct.gap_daily_m3} m3/day x ${ct.working_days_month} days = ${ct.gap_monthly_m3} m3/month
  Margin: $${ct.margin_per_m3}/m3
  Trips per truck: ${ct.trips_per_truck} actual vs ${ct.trips_per_truck_target} target

Loss breakdown:
${dx.loss_breakdown_detail.map(l => `  ${l.dimension}: $${l.amount}/month (${l.classification})`).join('\n')}

Performance gaps:
${Object.entries(dx.performance_gaps).map(([k, v]) => `  ${k}: ${v.actual} vs target ${v.target}`).join('\n')}

Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)
${tatSection}
Dispatch coordination: mechanism within turnaround (not a standalone KPI)
${buildDispatchContext(answers)}
Rejection: ${dx.reject_pct}% | Plant-side: ${Math.round(dx.reject_plant_fraction * 100)}%
Utilisation: ${dx.utilization_pct}% — consequence of turnaround and fleet, not independent cause
Fleet: ${dx.trucks_effective} effective of ${dx.trucks_total}
${buildIdleSignal(answers)}

Flags: ${dx.flags.length > 0 ? dx.flags.join(' · ') : 'none'}
Data quality: ${dx.data_quality}${dx.data_warnings.length > 0 ? ' — ' + dx.data_warnings.join(', ') : ''}
${benchmarks ? buildMarketContext(benchmarks) : ''}
WRITE 3-4 PARAGRAPHS. No headings. No bullet points.

Paragraph 1, System consequence: What happens to throughput and fleet utilisation as a result of the constraint. Use calc_trace numbers (trips per truck, m3/day gap). Max 3 sentences.
Paragraph 2, Why other dimensions are secondary: For each underperforming dimension not the constraint, one sentence on why fixing it first would not unlock throughput. Use performance_gaps data.
Paragraph 3, What resolving the constraint enables: Capacity, delivery cadence, fleet utilisation. No financial figures. Max 3 sentences.
Paragraph 4 (only if data supports it): Next constraint if another dimension is close to becoming the binding limit.`
}

function buildActionsPrompt(dx: ValidatedDiagnosis, answers: Answers, phase: string) {
  const performingWell = dx.total_loss === 0 && dx.actions.length === 0 && dx.data_quality !== 'insufficient'

  if (performingWell) {
    return `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Do not manufacture urgency that does not exist.
- Short sentences. One idea per sentence.

You are writing the Next Step section for a well-performing ready-mix plant. No significant losses found.

CONTEXT:
Plant: ${dx.plant_name}, ${dx.country}
Utilisation: ${dx.utilization_pct}%, target: 85%
Turnaround: ${dx.tat_actual} min, target: ${dx.tat_target} min

WRITE TWO SECTIONS:
One sentence (no heading): What the data confirms about this operation.
Next Step, heading on its own line: Exactly 3 sentences (confirmed, what on-site adds, maintenance suggestion).`
  }

  // ── PRE-ASSESSMENT ACTIONS ──
  if (phase === 'workshop') {
    const lo = dx.total_loss_range?.lo ?? Math.round(dx.total_loss * 0.7)
    const hi = dx.total_loss_range?.hi ?? Math.round(dx.total_loss * 1.3)
    const dispatchGap = dx.performance_gaps['dispatch']

    return `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL RANGES, not confirmed.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable.
- Short sentences. Do not use sales pitch language.
- Do NOT recommend specific operational fixes (retarder protocols, demurrage enforcement, maintenance schedules). These require on-site verification.
- All actions must be preparation or measurement actions.
- If utilisation is below target, do not present it as an independent problem. Explain it as the mathematical consequence of the turnaround and fleet combination. ${dx.utilization_pct}% utilisation is what a ${dx.tat_actual}-minute turnaround produces with this fleet size. It is a symptom, not a separate cause.

You are writing the Preparation section of a Pre-Assessment Report for ${dx.plant_name} in ${dx.country}. Based on self-reported data. No on-site visit done.

${EXAMPLE_ACTIONS}

CONTEXT:
Likely constraint area: ${dx.primary_constraint} (to be confirmed)
Estimated recoverable range: $${Math.round(lo / 1000)}k-$${Math.round(hi / 1000)}k/month
Recovery basis: gap between actual and target fleet output x $${dx.margin_per_m3}/m3 contribution margin x 40-65% execution range
Note: Include one sentence in Next Step explaining where the recovery figure comes from. Derived from reported fleet output gap and contribution margin, not an external benchmark.
Utilisation: ${dx.utilization_pct}% (target: 85%)
Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)
Dispatch coordination: managed via ${dx.performance_gaps['dispatch'] ? 'manual tools' : 'unknown method'} (dispatch is a mechanism that explains WHY turnaround is high, not a separate metric)
Rejection rate: ${dx.reject_pct}% (target: <3%)
${buildPainContext(dx)}
WRITE EXACTLY TWO SECTIONS:

Section 1, heading "Before the on-site visit" on its own line
3 to 5 numbered actions. Each: measurement or data-gathering (not operational fix), zero cost, specific enough to confirm done.

Section 2, heading "Next Step" on its own line
Exactly 3 sentences:
Sentence 1: What this pre-assessment has established, the estimated financial range at stake.
Sentence 2: What it cannot confirm yet. Name 2 specific unknowns requiring on-site observation.
Sentence 3: The on-site assessment as the natural next step, framed as an observation, not a sales pitch.`
  }

  // ── ON-SITE ACTIONS ──
  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL, frame as "up to $X" or "recoverable", never as confirmed losses.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable.
- Short sentences. One idea per sentence.
- Do not use sales pitch language.
- Warm, direct, experienced. The consultant has seen this pattern before.
- Actions in the prompt are pre-diagnosed from the data. Use them as the basis. Do not invent actions not supported by the diagnosis.
- Recovery opportunities (demurrage etc.) are separate from the loss figure. Never add them to the recoverable range. Mention them as incremental upside only.
- If approved_precision is "directional", frame all figures as directional estimates. If "range", use the lo-hi range. If "point_estimate", use the specific figure.`

  return `${RULES}

You are writing the Actions section of a Plant Intelligence Report for ${dx.plant_name} in ${dx.country}.

${EXAMPLE_ACTIONS}

CONTEXT:
Primary constraint: ${dx.primary_constraint}
Bottleneck loss: up to $${dx.main_driver.amount}/month
Recovery range: $${dx.combined_recovery_range.lo}-$${dx.combined_recovery_range.hi}/month
Recovery basis: gap between actual and target fleet output x $${dx.margin_per_m3}/m3 contribution margin x 40-65% execution range
Approved precision: ${dx.approved_precision}

Actions from diagnosis:
${dx.actions.map(a => `  [${a.time_horizon}] ${a.text}: ${a.detail}`).join('\n')}

Recovery opportunities (separate from loss):
${dx.recovery_opportunities.map(r => `  ${r.label}: $${r.amount}/month potential`).join('\n')}

${dx.cost_only_savings > 0 ? `Cost-only savings (demand-constrained): $${dx.cost_only_savings}/month` : ''}

Business implication: ${dx.business_implication.summary}

${buildPainContext(dx)}
${buildClusteringSignal(answers)}
WRITE EXACTLY FOUR SECTIONS:

Section 1, heading "Immediate, this week" on its own line
3 to 5 actions, numbered. Each: specific to this plant's data, measurable, zero capital.
Format: [Number]. [Action title]: [One sentence on what to do and how to confirm done.]

Section 2, heading "Short-term, weeks 2 to 4" on its own line
3 actions. Build on immediate: SOPs, tracking systems, enforcement mechanisms.

Section 3, heading "Validation, months 1 to 3" on its own line
2 to 3 actions. Confirm changes are holding and quantify improvement.

Section 4, heading "Next Step" on its own line
Exactly 3 sentences:
Sentence 1: What this assessment has established.
Sentence 2: What it cannot tell us yet. Name 2 specific unknowns.
Sentence 3: The logical conclusion, framed as an obvious observation.`
}