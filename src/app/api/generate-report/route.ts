import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import type { ValidatedDiagnosis } from '@/lib/diagnosis-pipeline'
import type { Answers } from '@/lib/calculations'
import { calculateReport, mapToReportInput, type ReportInput, type ReportCalculations } from '@/lib/reportCalculations'
import { replaceNarrativeTokens, assembleBoldSummaryLine, sanitizeNarrative } from '@/lib/reportAssembly'

// mapToReportInput is now in @/lib/reportCalculations.ts (shared between route + frontend)

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

  const { assessmentId, type, context } = await req.json()
  if (!assessmentId || !type || !context) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Extract ValidatedDiagnosis, raw answers, and phase from context
  const dx = context.dx as ValidatedDiagnosis | undefined
  const answers = (context.answers ?? {}) as Answers
  const phase = (context.phase ?? 'onsite') as string

  // Verify assessment exists and user has access (skipped for demo, no DB record)
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

  // ── Pure calculation (new system, parallel to dx.calc_trace) ──
  const reportInput = mapToReportInput(dx, answers)
  const rc = calculateReport(reportInput)

  let prompt: string
  try {
    const prompts: Record<string, string> = {
      executive: buildExecutivePrompt(dx, answers, phase, benchmarks, rc),
      diagnosis: buildDiagnosisPrompt(dx, answers, phase, benchmarks, rc),
      actions: buildActionsPrompt(dx, answers, phase, rc),
    }
    prompt = prompts[type]
    if (!prompt) return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  } catch (err) {
    console.error('Prompt build error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: `Prompt build failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }

  // Stream the response with retry on overload (no model fallback)
  const MAX_RETRIES = 3
  const RETRY_DELAYS = [2000, 4000, 8000]

  const encoder = new TextEncoder()
  // For pre-assessment executive: buffer AI response, replace tokens, then send
  const needsTokenReplacement = phase === 'workshop' && type === 'executive' && rc

  const stream = new ReadableStream({
    async start(controller) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1800,
            messages: [{ role: 'user', content: prompt }],
          })

          if (needsTokenReplacement) {
            // Buffer entire response, replace tokens, then send
            let rawText = ''
            for await (const chunk of response) {
              if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                rawText += chunk.delta.text
              }
            }
            // Post-process: sanitize causal-verb slip-throughs BEFORE token replacement
            const sanitized = sanitizeNarrative(rawText.trim())
            const processed = replaceNarrativeTokens(sanitized, rc, reportInput)
            controller.enqueue(encoder.encode(processed))
          } else {
            // Stream directly for on-site reports
            for await (const chunk of response) {
              if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(chunk.delta.text))
              }
            }
          }

          trackSpend(user.id)

          if (assessmentId !== 'demo') {
            const fullText = needsTokenReplacement
              ? replaceNarrativeTokens((await response.finalText()).trim(), rc, reportInput)
              : (await response.finalText()).trim()
            await supabase.from('reports').upsert({
              assessment_id: assessmentId,
              [type]: fullText,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'assessment_id' })
          }

          controller.close()
          return
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const isRetryable = msg.includes('overloaded') || msg.includes('Overloaded') || msg.includes('529') || msg.includes('rate_limit') || msg.includes('429')

          if (isRetryable && attempt < MAX_RETRIES - 1) {
            console.warn(`Report gen attempt ${attempt + 1} failed (${msg.slice(0, 50)}), retrying in ${RETRY_DELAYS[attempt]}ms...`)
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
            continue
          }

          if (isRetryable) {
            // All retries exhausted
            console.error('Report generation: all retries exhausted', msg)
            controller.error(new Error('Report generation is temporarily unavailable. Please try again in a few minutes. If the issue persists, contact support.'))
            return
          }

          // Non-retryable error
          console.error('Report generation error:', msg)
          controller.error(err)
          return
        }
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

"Turnaround time at an estimated 112 minutes is 28 minutes above the 84-minute target for suburban Saudi delivery zones. This excess compresses the number of trips each truck can complete per shift. At 24 trucks averaging 6.4 trips per day instead of the achievable 8.6, the fleet delivers roughly 773 m3/day against a target of 994 m3/day.

The plant manager identifies trucks stuck at construction sites during morning peak as the primary challenge. This is consistent with the turnaround data: when trucks arrive at sites without coordinated timing, site queuing extends every cycle. Dispatch coordination via spreadsheet and WhatsApp is the mechanism that inflates turnaround, not a separate problem.

The 28-minute turnaround excess is the single driver of the throughput gap. Rejection rate at 3% adds material cost but does not constrain how many trips the fleet completes. Utilisation at 72% is the mathematical result of a 112-minute cycle with this fleet size, not an independent cause."

END OF EXAMPLE`

const EXAMPLE_DIAGNOSIS = `EXAMPLE OF TARGET QUALITY — match this tone, structure, and level of specificity. Do not copy content. Use it as a calibration standard only.

"The data points toward fleet turnaround as the likely constraint. Each truck completes 6.4 trips per day against an achievable 8.6 at target turnaround. That difference, 2.2 trips per truck across 24 trucks, represents the core of the throughput gap. Utilisation at 72% is what a 112-minute cycle produces with this fleet. It is a consequence, not a separate problem.

Rejection rate at 3% sits at the target threshold and adds direct material cost per rejected load, but it does not limit throughput. Each rejection is an additive cost, it does not block the next delivery cycle. The throughput gap is driven by turnaround time. Fixing turnaround recovers volume. Fixing rejection recovers material cost. Both matter, but they are separate levers.

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
This pre-assessment has established that the plant has an estimated $54k-$88k per month in recoverable margin. This figure is derived from the gap between actual fleet output (6.4 trips/truck/day) and target output (8.6 trips/truck/day), multiplied by $33/m3 contribution margin, with a 40-65% execution range. Current utilisation at 72% is what a 112-minute turnaround produces with this fleet size. It is a symptom, not a cause. An on-site assessment will convert this preliminary view into a validated diagnosis."

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
  const lower = idle.toLowerCase()

  // "No" or "Never" signals
  if (/^no[^t]|never|not really/.test(lower))
    return `Plant idle signal: plant does not report waiting for trucks. This does not rule out fleet constraint but reduces its likelihood.`

  // "Yes" with explanation, or legacy "Regularly"/"Every day"
  if (/^yes|regularly|every day|always|constant|queue.*idle|idle.*queue/.test(lower))
    return `Plant idle signal: plant reports both queuing and idle periods. This confirms fleet coordination is the binding constraint, not production capacity. Reference this directly when explaining the constraint mechanism.`

  // Weak/occasional signal
  if (/occasional|sometimes|few times/.test(lower))
    return `Plant idle signal: plant reports occasionally waiting for trucks. This suggests fleet may be the binding constraint during peak periods.`

  return ''
}

// ── Sanitize management context: remove specific quantifications the AI might cite as evidence ──
function sanitizeManagementContext(text: string | undefined): string {
  if (!text || text.trim().length < 10) return ''
  return text
    // Remove numeric time durations: "2-3 hours", "45 minutes", "several hours"
    .replace(/\d+[-–]\d+\s*hours?/gi, 'extended periods')
    .replace(/\d+\s*hours?/gi, 'extended periods')
    .replace(/\d+\s*minutes?/gi, 'extended periods')
    .replace(/several\s+hours?/gi, 'extended periods')
    .replace(/a\s+few\s+hours?/gi, 'extended periods')
    // Remove percentage claims: "30%", "X percent"
    .replace(/\d+\s*%/g, 'significant')
    .replace(/\d+\s*percent/gi, 'significant')
    // Remove specific frequency claims used as plant-reported fact
    .replace(/every\s+morning/gi, 'during peak periods')
    .replace(/each\s+(morning|day)/gi, 'during peak periods')
    // Clean up doubled spaces
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── Pain context: reads from ValidatedDiagnosis.management_context ──
function buildPainContext(dx: ValidatedDiagnosis): string {
  const pain = sanitizeManagementContext(dx.management_context)
  if (!pain) return ''

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

// ══════════════════════════════════════════════════════════════════════════
// SHARED ON-SITE RULES (applies to all on-site prompt variants)
// ══════════════════════════════════════════════════════════════════════════

const ONSITE_CONTEXT = `CONTEXT: This is a $50,000 on-site diagnostic engagement over 20-30 days.
The consultant has observed, not intervened. Write accordingly.

REPORT AUDIENCE:
- Executive sections: CEO with no operational background. Financial language only.
- Operations sections: Plant manager with operational background. No financial jargon.

CONSULTANT ROLE:
You are a senior lean and operations consultant.
You observe, analyze, and advise. You do not implement.
Write in the voice of someone who has seen this pattern many times
and knows exactly what it means, and what it does not mean.

RULES:
- Always show the full value stream, not isolated metrics.
- Always document variation alongside averages (std dev, range) when available.
- Always state explicitly what is NOT the constraint and why.
- Root cause analysis must reach systemic level (3rd why minimum).
- Observations are facts. Interpretations are clearly marked as such.
- Recommendations include expected effect AND implementation risk.
- Never assign ownership to named individuals.
- Never set specific deadlines. Use urgency levels: immediate / within first month / medium-term / long-term.
- Never write implementation protocols. Advise on direction.
- Optimizing non-constraints wastes resources. State explicitly what NOT to do until the constraint is resolved.
- A consultant who only says what to do is not worth $50,000. Show that you understand what NOT to do and why.
- Do not present utilisation as an independent cause. It is always the consequence of turnaround and fleet size.
- Do not use first person plural. Do not write "we". Write in third person.
- Do not suggest "an on-site visit" as next step. You are already on-site.
- Do not hedge with "self-reported data" language when data is observed.

// GCC DOMAIN KNOWLEDGE PLACEHOLDER
// Replace this comment with Kurt's domain knowledge when available:
// - Typical waste patterns in GCC ready-mix ranked by frequency
// - Cultural factors affecting implementation in Saudi vs Europe
// - Three most common misdiagnoses in GCC ready-mix
// - Physical constraints specific to GCC plants VSM must account for
// - Ramadan and summer scheduling factors
// - Demurrage culture differences GCC vs Europe
`

// Three-tier epistemic framework for pre-assessment reports
const PRE_ASSESSMENT_EPISTEMIC = `EPISTEMIC FRAMEWORK (MANDATORY, apply before writing any sentence):
Every claim must be assigned to one of three tiers:
- Tier 1 (confirmed data): Numeric inputs (TAT, trucks, trips, output, rejection, margin). Use declarative language. "The reported turnaround time is 112 minutes."
- Tier 2 (signals/hypotheses): Patterns derived from data, qualitative inputs, ranked hypotheses. Use signal language: "The data points toward...", "This suggests...", "The most likely cause appears to be..." Never declarative. Never say "X causes Y", always "X appears to drive Y."
- Tier 3 (unknown until on-site): Anything requiring direct observation. Use verification language: "Cannot be determined remotely.", "Requires on-site measurement." Never as a conclusion.

Before writing any sentence, classify the claim. If Tier 2 is written declaratively, rewrite it. If Tier 3 is written as a conclusion, move it to verification language.

WRONG (Tier 2 as Tier 1): "Manual dispatch coordination is the mechanism that creates site delays."
RIGHT (Tier 2 correct): "The data suggests dispatch coordination may contribute to site delays. This requires on-site verification to confirm."

WRONG (Tier 3 as Tier 2): "The morning pattern indicates a systematic problem with site readiness."
RIGHT (Tier 3 correct): "Whether the morning pattern reflects a systematic problem or site-specific variation cannot be determined remotely."

WRONG (Tier 1 hedged): "The turnaround time appears to be around 112 minutes."
RIGHT (Tier 1 correct): "The reported turnaround time is 112 minutes."

The report's credibility depends on this distinction. A plant owner who finds one overstated conclusion will distrust all findings.`

function buildExecutivePrompt(dx: ValidatedDiagnosis, answers: Answers, phase: string, benchmarks: BenchmarkContext | null = null, rc?: ReportCalculations) {
  const RULES = `RULES:
- Use markdown for structure: **bold** for key figures, ## for section headings, numbered lists where appropriate. Use tables (markdown format) for comparisons.
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
    const ct = dx.calc_trace
    // Truck-days reframe: how many trucks could deliver the same output at target TAT
    const trucksNeeded = ct.trips_per_truck_target > 0
      ? Math.round(dx.trucks_effective * ct.trips_per_truck / ct.trips_per_truck_target * 10) / 10
      : 0
    // Lost trips = (target - actual) * trucks → equivalent parked trucks
    const lostTripsPerDay = Math.round((ct.trips_per_truck_target - ct.trips_per_truck) * dx.trucks_effective * 10) / 10
    const parkedEquivalent = ct.trips_per_truck_target > 0
      ? Math.round(lostTripsPerDay / ct.trips_per_truck_target * 10) / 10
      : 0
    // Cost of delay timeline (rounded to $1k)
    const rLo = Math.round(dx.combined_recovery_range.lo / 1000) * 1000
    const rHi = Math.round(dx.combined_recovery_range.hi / 1000) * 1000
    const quarterlyLo = Math.round(rLo * 3 / 1000) * 1000
    const quarterlyHi = Math.round(rHi * 3 / 1000) * 1000
    const annualLo = Math.round(rLo * 12 / 1000) * 1000
    const annualHi = Math.round(rHi * 12 / 1000) * 1000

    return `${RULES}

${PRE_ASSESSMENT_EPISTEMIC}

You are writing the initial analysis section of a Pre-Assessment Report for ${dx.plant_name} in ${dx.country}.
This is based on self-reported data collected remotely. No on-site verification.

PLACEHOLDER TOKEN RULES (MANDATORY):
1. Every number in your response MUST use a placeholder token from the list below. Never write a raw number.
2. Do not use "approximately", "roughly", "around", or "about" before any token. Tokens are exact values.
3. The constraint is {{CONSTRAINT}}. Every causal explanation must be consistent with this label.
4. Do not write the bold summary line. It is injected separately by the report formatter.
5. Do not mention rejection rate unless constraint is quality-related.
6. Do not invent operational details not present in the input data.
7. NEVER add a unit suffix after a token. Tokens already contain the correct formatted value. WRONG: "{{MONTHLY_GAP}} cubic meters". RIGHT: "{{MONTHLY_GAP}}". WRONG: "{{TAT_ACTUAL}} minutes". RIGHT: "{{TAT_ACTUAL}}-minute turnaround".
8. CONSTRAINT LANGUAGE: Do not use "operational delays" as a generic label. If the customer described specific external constraints (traffic bans, movement restrictions, regulatory), name them specifically. Example: "Riyadh truck movement restrictions and site access delays" not "operational delays."
9. HEDGING: Do not use "significantly", "severely", or "substantially". Use "appears to" or "the data suggests" instead.
10. NO CONCLUSIVE CAUSE: Never state external factors ARE the cause. State they are REPORTED and CONSISTENT WITH the observed gap. WRONG: "Movement restrictions cause the turnaround excess." RIGHT: "The reported movement restrictions are consistent with the observed turnaround excess."
11. RECOVERY FRAMING: When referencing recovery potential, include "depending on execution capability and the proportion of delays that prove addressable through operational changes."
12. RANGES OVER PRECISION: When referencing on-site findings, use conditional language. Never promise a precise outcome.
13. NO CAUSAL VERBS (META-RULE, ALL CONTEXTS, ALL SUBJECTS, ALL VERB FORMS, ALL SYNONYMS): Any verb that attributes causation or origin to a factor in a pre-assessment context is banned, regardless of form, subject, or construction. We do not yet have the data to make causal claims. THIS RULE APPLIES REGARDLESS OF SUBJECT (external factor, internal metric, observation pronoun "This"/"The data", or neutral noun) and REGARDLESS OF CONSTRUCTION (direct, hypothetical, passive, participle, subordinate clause). EXPLICITLY BANNED VERBS (every form, every tense, every conjugation including base/infinitive): drive, drives, drove, driving, driven; create, creates, created, creating; cause, causes, caused, causing; lead to, leads to, led to, leading to; stem from, stems from, stemmed from, stemming from; arise from, arises from, arose from, arising from; flow from, flows from, flowed from, flowing from; result from, results from, resulted from, resulting from; produce, produces, produced, producing; generate, generates, generated, generating. APPROVED REPLACEMENTS: "is consistent with", "points to", "appears associated with", "is modelled from", "the data suggests", "is based on", "contributes to". WHEN IN DOUBT, use "consistent with" or "points to". WRONG (external subject): "Movement restrictions create the turnaround excess." WRONG (internal subject): "The TAT excess creates a revenue gap." WRONG (observation subject): "This creates a monthly output gap." WRONG (hypothetical): "Cannot determine which component drives the delay." WRONG (passive): "Delays are driven by traffic." WRONG (participle): "delays stemming from restrictions". WRONG (base form): "determine which delays stem from restrictions". WRONG (synonym): "delays arising from traffic". RIGHT: "The observed turnaround excess is consistent with the reported movement restrictions." RIGHT: "The revenue gap is modelled from the TAT excess." RIGHT: "This points to a monthly output gap." RIGHT: "Cannot determine which component contributes most to the delay." RIGHT: "delays associated with restrictions".
14. TRIPS AS OBSERVATIONS, NOT CAUSE-EFFECT: When referencing actual vs target trips, state them as observations, not as a cause-effect pair. WRONG: "Because trucks complete {{TRIPS_ACTUAL}} trips instead of {{TRIPS_TARGET}}, output falls short." RIGHT: "Trucks currently complete {{TRIPS_ACTUAL}} trips per day; the {{TAT_TARGET}}-minute target would support {{TRIPS_TARGET}}."
15. m³ RANGES IN NARRATIVE: When referencing monthly output or monthly gap in m³, always use ranges, never precise figures. Use {{GAP_M3_LOW}} and {{GAP_M3_HIGH}} for the monthly gap in m³. Use {{ACTUAL_M3_LOW}} and {{ACTUAL_M3_HIGH}} for monthly actual output. Do not add m³ to every sentence — use it once in paragraph 1 to give the gap physical context alongside the dollar figure. Preferred format: "{{MONTHLY_GAP}} — equivalent to {{GAP_M3_LOW}}-{{GAP_M3_HIGH}} m³ of unrealised monthly output". Precise m³ only appears in the Capacity Detail table, never in your narrative.
16. NARRATIVE MUST REFLECT CONSTRAINT LABEL: The narrative must reference the actionable dimension named in the CONSTRAINT label ({{CONSTRAINT}}). The label is what the on-site assessment will focus on — the narrative must acknowledge it as the addressable dimension, not as a confirmed cause.
  - If CONSTRAINT contains "Dispatch and site coordination": paragraph 1 or 2 must state that dispatch sequencing or coordination within permitted operating windows is the addressable dimension. Example: "The addressable dimension is how dispatch coordinates deliveries within permitted operating windows; whether current sequencing compounds or mitigates the external restrictions cannot be determined remotely."
  - If CONSTRAINT contains "Dispatch clustering": narrative must reference dispatch timing or order-release patterns as the addressable dimension.
  - If CONSTRAINT contains "Site access coordination": narrative must reference site readiness patterns or customer-side coordination as the addressable dimension.
  - If CONSTRAINT contains "Fleet coordination": narrative must reference truck allocation, routing, or fleet-side scheduling as the addressable dimension.
  - For other labels: the narrative must explicitly name what the label identifies as actionable.
  DO NOT: devote more than one paragraph to external context. At least one paragraph must describe what the on-site assessment will specifically observe about the addressable dimension — e.g. "on-site observation will measure dispatch-to-first-delivery times, site sequencing, and wait-time distribution across permitted windows". Do not restate the external context twice in two consecutive paragraphs.
17. TAT-GAP RELATIONSHIP IS INFERENCE, NOT CAUSATION: When referencing the relationship between turnaround time and the financial gap, never use "creating", "resulting in", "producing", "associated with". The gap is a model output, not a verified consequence. Approved phrasing for this specific relationship: "pointing to", "modelled from", "the gap is based on". PREFERRED: "a 35-minute turnaround excess pointing to a $557,000 monthly output gap". ALSO ACCEPTABLE: "a monthly output gap modelled from the 35-minute turnaround excess". AVOID: "associated with a monthly output gap" (technically correct but reads as clinical system output rather than consultant language). WRONG: "a monthly revenue gap created by the turnaround excess".

AVAILABLE TOKENS:
{{RECOVERY_LOW}} — recovery range low bound
{{RECOVERY_HIGH}} — recovery range high bound
{{MONTHLY_GAP}} — total monthly output gap
{{TAT_ACTUAL}} — actual turnaround time in minutes
{{TAT_TARGET}} — target turnaround time in minutes
{{TAT_EXCESS}} — turnaround excess in minutes (0 if at target)
{{TRIPS_ACTUAL}} — actual trips per truck per day
{{TRIPS_TARGET}} — target trips per truck per day
{{PARKED_TRUCKS}} — equivalent parked trucks
{{QUARTERLY_LOW}} — quarterly recovery range low
{{QUARTERLY_HIGH}} — quarterly recovery range high
{{ANNUAL_LOW}} — annual recovery range low
{{ANNUAL_HIGH}} — annual recovery range high
{{TRUCKS}} — number of trucks assigned
{{CONSTRAINT}} — the likely constraint label
{{GAP_M3_LOW}} — monthly gap in m³, low bound (rounded to 50)
{{GAP_M3_HIGH}} — monthly gap in m³, high bound (rounded to 50)
{{ACTUAL_M3_LOW}} — monthly actual output in m³, low bound (rounded to 50)
{{ACTUAL_M3_HIGH}} — monthly actual output in m³, high bound (rounded to 50)

PLANT CONTEXT (self-reported, not verified):
Turnaround: {{TAT_ACTUAL}} min (target: {{TAT_TARGET}} min)${rc && rc.gap_driver !== 'tat' ? '\nTAT is at or near target. Do not mention turnaround excess. Focus on utilisation gap and dispatch signals.' : ''}
${sanitizeManagementContext(dx.management_context) ? `Plant manager's stated challenge: "${sanitizeManagementContext(dx.management_context)}"
Note: Self-reported. Frame as "The plant reports..." Never as an independent finding.` : ''}
Dispatch coordination: managed via ${dx.performance_gaps['dispatch'] ? 'manual tools' : 'unknown method'}
Rejection rate: ${dx.reject_pct}% (target: <3%)
Utilisation: ${dx.utilization_pct}% (target: 85%)
Fleet: {{TRUCKS}} trucks assigned

${rc?.has_external_constraint ? `EXTERNAL CONSTRAINT CONTEXT:
This plant has reported external regulatory constraints. The main report benchmarks against normal operating conditions (TARGET_TAT). A separate regulatory caveat section will show near-term recovery under current restrictions.
Your narrative must:
1. Present the main gap ({{MONTHLY_GAP}}) as the full recovery potential under normal conditions
2. Acknowledge that external constraints currently limit near-term recovery, but do not quantify this in the narrative (it is quantified in the caveat section)
3. Frame the on-site assessment as the step that determines what is achievable now versus later
Do not mention specific regulatory recovery figures in the narrative.
` : ''}
STRUCTURE — write exactly three paragraphs, maximum 120 words total:

Paragraph 1: The mechanism behind {{CONSTRAINT}}, grounded in the qualitative inputs above. Use {{MONTHLY_GAP}} for the gap. Use {{RECOVERY_LOW}} to {{RECOVERY_HIGH}} for the recovery range. End with: "At this recovery range, the unaddressed gap compounds to {{QUARTERLY_LOW}}-{{QUARTERLY_HIGH}} over a quarter and {{ANNUAL_LOW}}-{{ANNUAL_HIGH}} over a year."

Paragraph 2: What cannot be determined remotely and why. Reference specific unknowns.

Paragraph 3: What the on-site assessment will resolve. Be specific to this plant's signals.`
  }

  // ── ON-SITE EXECUTIVE ──
  const tatSection = buildTATBreakdown(dx)
  return `${RULES}

${ONSITE_CONTEXT}

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
${sanitizeManagementContext(dx.management_context) ? `Plant manager's stated challenge: "${sanitizeManagementContext(dx.management_context)}"
Note: This is self-reported by the plant, not independently observed. Frame as "The plant reports..." or "Plant management identifies..." Never present it as an assessment finding or external observation. Use it to provide context, not as evidence. Paraphrase, do not quote verbatim.` : ''}
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

function buildDiagnosisPrompt(dx: ValidatedDiagnosis, answers: Answers, phase: string, benchmarks: BenchmarkContext | null = null, rc?: ReportCalculations) {
  const RULES = `RULES:
- Use markdown for structure: **bold** for key figures and cause labels, ## for section headings where appropriate.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL, frame as "up to $X" or "recoverable", never as confirmed losses.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive.
- Short sentences. One idea per sentence.
- Write for a plant owner who is intelligent and has no patience for consultants.
- Do not present utilisation as an independent cause alongside turnaround. Utilisation is the output of turnaround and fleet size combined.
- The calc_trace is provided so you can explain the mechanism quantitatively. Use the actual numbers to explain what is happening.
- FLEET PRODUCTIVITY: When describing the utilisation gap, always state three concrete numbers: (1) max fleet trips/day at current TAT, (2) actual trips/day, (3) gap in absolute trips converted to truck-equivalents. The plant owner thinks in trucks and trips, not percentages. Never describe the utilisation gap in percentage terms alone.
- If data_quality is "directional" or flags are present, acknowledge the limitation in one sentence. Do not repeat each flag.
- If TAT breakdown is absent: do not speculate on which component drives the turnaround excess.
- Never use first person plural. Do not write "we". Write in third person or address the plant directly.
- DATA SOURCE DISCIPLINE: Qualitative inputs from the plant (text fields, operational descriptions, manager observations) must never be presented as confirmed findings or independent evidence. Frame as reported patterns requiring verification. WRONG: "The plant manager's observation indicates this is not random variation." RIGHT: "The plant reports morning productivity loss. Whether this reflects a consistent pattern or site-specific variation will be confirmed during the on-site visit." Apply this discipline to every qualitative reference.
- SOLUTION-FREE ZONE: Preliminary Analysis must contain zero references to solutions, tools, systems, or interventions. It describes only what the data shows and what requires on-site verification. Never write about scheduling tools, dispatch software, automation, process improvements, or any specific solution. The only forward-looking language permitted: "The on-site assessment will determine..." followed by what will be measured, never what will be changed or implemented.
  WRONG: "Whether automated scheduling tools could reduce coordination gaps by improving truck sequencing"
  RIGHT: "Whether dispatch timing patterns create systematic clustering that extends cycle times beyond site-side delays"`

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
    const ct = dx.calc_trace
    const tatExcess = dx.tat_actual - dx.tat_target

    // Determine hypothesis ranking based on qualitative signals
    const mgmtCtx = (dx.management_context || '').toLowerCase()
    const idleSignal = ((answers?.plant_idle as string) || '').toLowerCase()
    const hasSiteWaitSignal = /wait|queue|site|ready|morning|idle|stuck/.test(mgmtCtx)
    // Free text: "Yes" + any explanation, or legacy dropdown "Regularly"/"Every day"
    const hasIdleSignal = /^yes|regularly|every day|idle.*waiting|queue.*idle|idle.*queue/.test(idleSignal)
    const hasBothQueueAndIdle = hasSiteWaitSignal && hasIdleSignal
    // Conflicting constraints: TAT excess AND plant can't keep up at target TAT
    const tatExcessPct = dx.tat_target > 0 ? tatExcess / dx.tat_target : 0
    const hasConflictingConstraints = tatExcessPct > 0.2 && ct.plant_daily_m3 < ct.fleet_target_daily_m3

    return `${RULES}

${PRE_ASSESSMENT_EPISTEMIC}

You are writing the Preliminary Analysis section of a Pre-Assessment Report for ${dx.plant_name} in ${dx.country}.
This is based on self-reported data collected remotely. No on-site verification.

${EXAMPLE_DIAGNOSIS}

CRITICAL CONSTRAINTS:
- Do NOT reference TAT component breakdown.
- Do NOT name a definitive constraint. Use "likely" or "appears to be".
- Use ranges: "$${Math.round(lo / 1000)}k-$${Math.round(hi / 1000)}k/month".
- Frame all analysis as preliminary.
- Use only the trip and TAT figures provided in PLANT DATA. Never derive or approximate these figures independently. If a figure is not in PLANT DATA, do not include it.
- Rejection rate is ALWAYS additive leakage, never a throughput constraint. It adds material cost but does not limit how many trips the fleet completes. Never open a paragraph with rejection as the primary finding. Never frame rejection as "the likely constraint." Turnaround time is the throughput driver. Rejection is a cost driver. They are not interchangeable.

PLANT DATA (self-reported, not verified — use ONLY these figures):
Likely constraint area: ${dx.primary_constraint} (to be confirmed on-site)
Estimated recoverable range: $${Math.round(lo / 1000)}k-$${Math.round(hi / 1000)}k/month
Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)${tatExcess > 0 ? `, excess: ${tatExcess} min` : ' — AT TARGET, not the constraint'}
Trips per truck per day: ${ct.trips_per_truck} actual vs ${ct.trips_per_truck_target} target
Daily output: ${ct.actual_daily_m3} m3/day actual vs ${ct.target_daily_m3} m3/day target
${tatExcess <= 0 ? 'TAT STATUS: AT TARGET. Do not mention turnaround excess. The utilisation gap comes from dispatch coordination or fleet availability, not cycle time.' : ''}
Dispatch coordination: managed via ${dx.performance_gaps['dispatch'] ? 'manual tools' : 'unknown method'}${tatExcess <= 0 ? ' — with TAT at target, dispatch timing is the primary investigation area' : ''}
Rejection rate: ${dx.reject_pct}% (target: <3%)${dx.reject_pct > 3 ? `\nRejected loads per month: approximately ${Math.round((dx.reject_pct / 100) * ct.trips_per_truck * dx.trucks_effective * ct.working_days_month)} loads. At ${dx.reject_pct}%, each requires disposal, potential re-delivery, and driver time that does not generate revenue. Use Tier 1 for the count, Tier 2 for whether rejections cluster at specific sites or times.` : ''}
Utilisation: ${dx.utilization_pct}% (target: 85%)
Fleet: ${dx.trucks_effective} effective trucks of ${dx.trucks_total} assigned
Max fleet trips/day at current TAT: ${dx.tat_actual > 0 ? Math.round(dx.trucks_effective * (dx.operating_hours * 60 / dx.tat_actual)) : 0}
Actual trips/day: ${Math.round(ct.trips_per_truck * dx.trucks_effective)}
Gap: ${dx.tat_actual > 0 ? Math.round(dx.trucks_effective * (dx.operating_hours * 60 / dx.tat_actual)) - Math.round(ct.trips_per_truck * dx.trucks_effective) : 0} unrealised trips/day (= ${dx.tat_actual > 0 ? Math.round((dx.trucks_effective * (dx.operating_hours * 60 / dx.tat_actual) - Math.round(ct.trips_per_truck * dx.trucks_effective)) / (dx.operating_hours * 60 / dx.tat_actual) * 10) / 10 : 0} truck-equivalents idle)
${sanitizeManagementContext(dx.management_context) ? `Plant manager's stated challenge: "${sanitizeManagementContext(dx.management_context)}"` : ''}
${buildIdleSignal(answers)}
${buildDispatchContext(answers)}

${hasConflictingConstraints ? `CONFLICTING CONSTRAINTS DETECTED: Remote data shows both a TAT excess of ${tatExcess} minutes AND a production capacity (${ct.plant_daily_m3} m3/day) that cannot fully meet fleet demand at target TAT (${ct.fleet_target_daily_m3} m3/day). The on-site assessment will determine which constraint delivers the greater return when addressed first. Acknowledge both signals in the analysis.` : ''}

IMPORTANT: The reader has already read the executive summary. Do not repeat the same observations or restate metrics they have already seen. Add new analytical depth, not a second summary.

STRUCTURE:
Paragraph 1: Go deeper than the executive summary. Explain the mechanism: why does this gap exist? What systemic factor connects the metrics? Do not re-list TAT vs target or utilisation vs target. The reader already knows.

${dx.primary_constraint === 'Fleet' || dx.primary_constraint === 'Logistics' ? `Paragraph 2: Present three ranked cause hypotheses. Use **bold** labels.
RULE: Never include "loading bay constraints" or "batching cycle misalignment" as hypotheses unless the plant data specifically references production stops or loading delays. Generic RMX problems with no connection to the plant's reported data must not appear.
RULE: Never cite the plant's own quantified claims (e.g. "2-3 hours", "every morning") as evidence in a hypothesis. Describe the mechanism, not the plant's words.
  WRONG: "Most likely: Site readiness delays drive morning productivity loss, as the plant reports losing 2-3 hours when construction sites are unprepared."
  RIGHT: "Most likely: Site readiness delays appear to drive morning productivity loss. Trucks arriving before construction sites are prepared for delivery, particularly during peak morning hours. Whether this pattern is consistent across all sites or concentrated at specific customers requires on-site verification."

${hasBothQueueAndIdle ? `The plant reports both site queuing AND idle periods.

RANKING RULE: "Most likely" and "Second likely" must be site coordination and dispatch timing. Production capacity belongs ONLY in "Requires on-site verification". Never place production batching, loading efficiency, or capacity constraints in Most likely or Second likely when site readiness or dispatch signals are present.

**Confirmed primary cause: Site coordination failures.** Trucks are dispatched without real-time knowledge of site readiness, particularly during morning peak when sites are systematically not ready. The plant reports both trucks waiting at sites and periods with no trucks available. This is the signature of cluster dispatching: trucks leave in groups, creating simultaneous site congestion followed by plant idle time. With ${ct.trips_per_truck} trips per truck against a target of ${ct.trips_per_truck_target}, each wasted cycle compounds across ${dx.trucks_effective} trucks.

**Second likely: Dispatch bunching.** Trucks are dispatched in clusters to the same sites rather than staggered, creating bunching where multiple trucks queue at the same location simultaneously while the plant sits idle waiting for returns.

**Requires on-site verification:** Whether production capacity becomes the binding constraint if TAT improves. At target TAT the fleet would demand ${ct.fleet_target_daily_m3} m3/day but plant capacity is ${ct.plant_daily_m3} m3/day.${hasConflictingConstraints ? ' Both constraints are present in the data. The on-site assessment will determine which delivers the greater return when addressed first.' : ''}` : hasSiteWaitSignal ? `The plant reports challenges related to site waiting or morning delays.

RANKING RULE: "Most likely" and "Second likely" must be site coordination and dispatch timing. Production capacity belongs ONLY in "Requires on-site verification". Never place production batching, loading efficiency, or capacity constraints in Most likely or Second likely when site readiness or dispatch signals are present.

**Most likely: Site coordination failures.** Trucks arriving before sites are ready, particularly during morning peak. This creates a predictable daily pattern of wasted truck cycles concentrated in the first operating hours. With a ${tatExcess}-minute turnaround excess across ${dx.trucks_effective} trucks, uncoordinated dispatch amplifies this into the full throughput gap.

**Second likely: Dispatch bunching.** Trucks dispatched in clusters to the same sites rather than staggered, creating bunching where multiple trucks queue at the same location simultaneously while the plant sits idle waiting for returns.

**Requires on-site verification:** Whether production capacity becomes the binding constraint if TAT improves. At target TAT the fleet would demand ${ct.fleet_target_daily_m3} m3/day but plant capacity is ${ct.plant_daily_m3} m3/day.${hasConflictingConstraints ? ' Both constraints are present in the data. The on-site assessment will determine which delivers the greater return when addressed first.' : ''}` : `**Most likely: Dispatch timing.** Trucks dispatched in clusters creating peak bunching and idle periods on the same day. With a ${tatExcess}-minute turnaround excess across ${dx.trucks_effective} trucks, uncoordinated dispatch is the most common amplifier in GCC ready-mix operations.

**Second likely: Site readiness.** Trucks arriving before sites are ready, extending the site wait component of turnaround. Without real-time site status, dispatch decisions are based on assumptions rather than actual readiness.

**Requires on-site verification:** Whether the ${tatExcess}-minute TAT excess is consistent across all sites or concentrated at specific high-volume customers.${hasConflictingConstraints ? ` Also: whether production capacity (${ct.plant_daily_m3} m3/day) becomes the binding constraint if TAT improves to target (fleet would demand ${ct.fleet_target_daily_m3} m3/day).` : ''}`}` : `Paragraph 2: Present two or three hypotheses for what is driving the identified constraint area. Use **bold** labels: "Most likely:", "Second likely:", "Requires on-site verification:". Each hypothesis gets one sentence explaining the mechanism. Never include generic RMX problems (loading bay constraints, batching misalignment) unless the plant data specifically references them. ${dx.management_context ? `Use the plant's reported challenge ("${dx.management_context}") to inform the ranking.` : ''}`}

Paragraph 3: What the on-site assessment will determine. Name 2-3 operational questions that can only be answered by observing the plant.`
  }

  // ── ON-SITE DIAGNOSIS ──
  const ct = dx.calc_trace
  const tatSection = buildTATBreakdown(dx)
  const dispatchGap = dx.performance_gaps['dispatch']

  return `${RULES}

${ONSITE_CONTEXT}

You are writing the Constraint Analysis section of a Plant Intelligence Report for ${dx.plant_name} in ${dx.country}.
The reader already knows the bottleneck mechanism. Start from its consequences for the system.

${EXAMPLE_DIAGNOSIS}

PLANT DATA:
Primary constraint: ${dx.primary_constraint}
Verdict cause: ${dx.verdict_cause}
Mechanism: ${dx.mechanism_detail}

Bottleneck loss: up to $${(Math.round(dx.main_driver.amount / 1000) * 1000).toLocaleString('en-US')}/month
Recovery range: $${(Math.round(dx.combined_recovery_range.lo / 1000) * 1000).toLocaleString('en-US')}-$${(Math.round(dx.combined_recovery_range.hi / 1000) * 1000).toLocaleString('en-US')}/month

Calculation trace:
  Fleet daily output: ${ct.fleet_daily_m3} m3/day
  Plant daily capacity: ${ct.plant_daily_m3} m3/day
  Actual daily output: ${ct.actual_daily_m3} m3/day
  Target daily output: ${ct.target_daily_m3} m3/day
  Gap: ${ct.gap_daily_m3} m3/day x ${ct.working_days_month} days = ${ct.gap_monthly_m3} m3/month
  Margin: $${ct.margin_per_m3}/m3
  Trips per truck: ${ct.trips_per_truck} actual vs ${ct.trips_per_truck_target} target

Loss breakdown:
${dx.loss_breakdown_detail.map(l => `  ${l.dimension}: $${(Math.round(l.amount / 1000) * 1000).toLocaleString('en-US')}/month (${l.classification === 'overlapping' ? 'throughput loss' : l.classification === 'additive' ? 'additive leakage' : l.classification})`).join('\n')}
Note: Figures rounded to nearest $1,000. Totals may vary by rounding.

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

For each finding (minimum 2, maximum 4), use this exact structure:

FINDING: [title — one line]
Observed: [facts only, no interpretation. What the data shows.]
Direct cause: [first-order mechanism — what is physically happening]
Root cause: [why the direct cause exists — one level deeper]
Systemic cause: [why the root cause is not already fixed — incentive structure, system limitation, organizational gap]
Financial impact: [$/month and % of total loss]

Example of target structure:

FINDING: Site waiting time 34 min, 20 min above benchmark
Observed: Trucks arrive at sites before pour crews are ready. Average wait 34 min across 98 observed deliveries.
Direct cause: No coordination between dispatch and site preparation. Trucks depart based on plant readiness, not site readiness.
Root cause: Dispatcher has no visibility of site status. No communication protocol requires site confirmation before departure.
Systemic cause: Demurrage clause exists but is not enforced. Sites have no financial incentive to be ready on time. The cost of waiting is absorbed entirely by the plant.
Financial impact: Addresses primary constraint ($173k/month throughput loss).

After the findings, add one paragraph: what resolving the primary constraint enables (capacity, delivery cadence). No financial figures in this paragraph.`
}

function buildActionsPrompt(dx: ValidatedDiagnosis, answers: Answers, phase: string, rc?: ReportCalculations) {
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
    const loR = Math.round(lo / 1000) * 1000
    const hiR = Math.round(hi / 1000) * 1000
    const ct = dx.calc_trace
    const tatExcess = dx.tat_actual - dx.tat_target
    const monthlyGap = Math.round(ct.gap_monthly_m3 * ct.margin_per_m3 / 1000) * 1000

    // Constraint label and primary signal for prompt context
    const tatExcessPct = dx.tat_target > 0 ? tatExcess / dx.tat_target : 0
    const hasConflicting = tatExcessPct > 0.2 && ct.plant_daily_m3 < ct.fleet_target_daily_m3
    const constraintLabel = hasConflicting ? 'Conflicting signals (fleet coordination + production capacity)' : tatExcessPct > 0.2 ? 'Fleet coordination' : dx.primary_constraint
    const mgmtCtx = (dx.management_context || '').toLowerCase()
    const primarySignal = /wait|queue|site|ready|morning|idle|stuck/.test(mgmtCtx)
      ? 'site readiness / dispatch timing' : 'turnaround excess'

    return `${PRE_ASSESSMENT_EPISTEMIC}

RULES:
- Use markdown for structure: **bold** for key terms, ## for section headings, numbered lists for actions.
- Never invent data. Use only the figures provided in PLANT DATA.
- All financial figures are POTENTIAL RANGES, not confirmed.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable.
- Short sentences. Do not use sales pitch language.
- Do NOT recommend specific operational fixes (retarder protocols, demurrage enforcement, maintenance schedules). These require on-site verification.
- All actions must be preparation or measurement actions.
- Use "I will" not "we will" in the measurement section. This is a personal commitment from the assessor.
- DATA SOURCE DISCIPLINE: Never present the plant's own qualitative descriptions as confirmed findings. Frame all qualitative inputs as hypotheses to be tested during the on-site visit.
  WRONG: "The plant reports losing productive time each morning due to sites not being ready."
  RIGHT: "The reported pattern of morning delays will be verified during the on-site assessment."
- NEVER ask the plant to log, track, observe, or record anything going forward. Observation and diagnostic data collection is the assessor's job during the on-site visit.

You are writing the Preparation and Measurement section of a Pre-Assessment Report for ${dx.plant_name} in ${dx.country}. Based on self-reported data. No on-site visit done.

${EXAMPLE_ACTIONS}

PLANT DATA (use these exact figures in every preparation and measurement item):
Turnaround: ${dx.tat_actual} min (target: ${dx.tat_target} min)${tatExcess > 0 ? `\nExcess: ${tatExcess} min per cycle` : '\nTAT STATUS: AT TARGET. Do not reference turnaround excess. Focus on utilisation gap and dispatch coordination.'}
Trips per truck: ${ct.trips_per_truck} actual vs ${ct.trips_per_truck_target} target
Fleet: ${dx.trucks_effective} effective trucks of ${dx.trucks_total} assigned
Monthly gap: $${monthlyGap.toLocaleString('en-US')}/month
Recovery range: $${loR.toLocaleString('en-US')}-$${hiR.toLocaleString('en-US')}/month (40-65% execution range)
Contribution margin: $${ct.margin_per_m3}/m3
Constraint: ${constraintLabel}
Primary signal: ${primarySignal}
Rejection rate: ${dx.reject_pct}% (target: <3%)
Utilisation: ${dx.utilization_pct}% (target: 85%) — consequence of TAT and fleet size, not independent cause
${sanitizeManagementContext(dx.management_context) ? `Plant manager's stated challenge: "${sanitizeManagementContext(dx.management_context)}"\nNote: This is self-reported. Frame as a pattern to verify, never as a confirmed finding.` : ''}
${buildClusteringSignal(answers)}

WRITE EXACTLY THREE SECTIONS:

## Before the visit
Maximum 5 numbered items across two categories. Each item: bold instruction + one paragraph explaining why it matters.

CATEGORY 1 — HISTORICAL RECORDS (max 3 items)
Request ONLY documents that already exist and cover a historical period. These cannot be collected during the visit.
RULE: Never ask the plant to create new data, observe their own operations, log timestamps going forward, or perform any diagnostic activity. Observation and timing is what the on-site visit delivers.

Generate 3 items requesting historical records relevant to this plant's constraint signals. Examples of acceptable requests:
- Delivery tickets from the last 30 days (paper, Excel, or system printout)
- Rejection and return records from last 3 months
- Production batch logs from last month showing daily output
- Dispatch records or WhatsApp dispatch history if available

Each item must state what format is acceptable (paper, Excel, system printout — all fine) and explain what historical pattern it reveals that cannot be reconstructed during the visit.

WRONG (observation task): "Ask the dispatcher to log four timestamps for every truck for one week."
RIGHT (historical record): "Pull delivery tickets from the last 30 days. Paper tickets, Excel records, or system printouts are all acceptable. These show historical cycle patterns across ${dx.trucks_effective} trucks that cannot be reconstructed during a single visit."

CATEGORY 2 — ACCESS AND CONTACTS (exactly 2 items, use these verbatim)
4. **Morning access.** Confirm that I can observe operations during peak morning hours on the first day, typically 6:00 AM to 10:00 AM.${tatExcessPct > 0.2 ? ` Morning peak is where the ${tatExcess}-minute turnaround excess is most likely concentrated.` : ' Morning peak is when dispatch coordination patterns are most visible and fleet idle time most likely occurs.'}

5. **Key contacts.** Identify the dispatcher and operations supervisor I will work with during the visit. These are the two people who control truck flow and production sequencing.

## What I will measure on-site
Exactly 3 measurement items. Use "I will" throughout, never "we will". Each item MUST have all three parts:

**Part 1 — THE MEASUREMENT:** Name the specific thing being measured. Must sound precise and methodological.

**Part 2 — WHY INTERNAL CANNOT DO THIS:** 1-2 sentences explaining what specialist skill, independence, or methodology is required that an internal person cannot provide. This is the most important part. It must answer the unspoken question: "Why can't my operations manager do this with a stopwatch?"

**Part 3 — WHAT IT ENABLES:** One sentence connecting this measurement to a specific financial decision. Must reference the $${monthlyGap.toLocaleString('en-US')}/month gap or $${loR.toLocaleString('en-US')}-$${hiR.toLocaleString('en-US')}/month recovery range.

The three items must cover:
1. **Cycle time breakdown** — timing and categorising every minute of 50+ consecutive truck cycles across the full operating day, not averages but the full distribution
2. **Dispatch pattern analysis** — mapping the timing gap between consecutive truck departures to reveal cluster-dispatching patterns that internal observation misses
3. **Delay cost attribution** — converting each delay component into a dollar value per minute so the plant knows which single intervention returns the most within 30 days

EXAMPLE of required quality (adapt using actual plant values, do not copy verbatim):
"1. **Full-cycle time study.** I will time and categorise every minute of 50 consecutive truck cycles across the full operating day — not averages, but the complete distribution showing where variation concentrates.

Drivers behave differently when observed by someone they report to. An internal measurement captures what people do when they know they are being watched, not the actual pattern that produces the current ${dx.tat_actual}-minute average. I will observe without advance notice to individual drivers, which is the only way to capture the real cycle.

The output is a precise breakdown of the $${monthlyGap.toLocaleString('en-US')}/month gap by cause — showing which single intervention returns the most within 30 days and which changes require longer implementation."

## Next Step
One short paragraph: What this pre-assessment has established (recovery range and basis), what it cannot confirm remotely (2 specific unknowns), and the on-site assessment as the logical next step. Not a sales pitch.
DATA SOURCE DISCIPLINE applies here too. Never present qualitative plant input as a confirmed finding.
  WRONG: "the reported morning productivity loss of 2-3 hours represents a systematic pattern"
  RIGHT: "whether the pattern of morning delays the plant describes is consistent across all sites or concentrated at specific customers"`
  }

  // ── ON-SITE ACTIONS ──
  const RULES = `RULES:
- Use markdown for structure: **bold** for action titles and urgency labels, ## for section headings, numbered lists for actions.
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

${ONSITE_CONTEXT}

You are writing the Actions section of a Plant Intelligence Report for ${dx.plant_name} in ${dx.country}.

${EXAMPLE_ACTIONS}

CONTEXT:
Primary constraint: ${dx.primary_constraint}
Bottleneck loss: up to $${(Math.round(dx.main_driver.amount / 1000) * 1000).toLocaleString('en-US')}/month
Recovery range: $${(Math.round(dx.combined_recovery_range.lo / 1000) * 1000).toLocaleString('en-US')}-$${(Math.round(dx.combined_recovery_range.hi / 1000) * 1000).toLocaleString('en-US')}/month
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
WRITE EXACTLY TWO SECTIONS:

Section 1: For each action from the diagnosis, write a prose recommendation in this format:
[Title] — [Urgency: immediate / within first month / medium-term] — [Org level]
Basis: [the observation that motivates this action]
Expected effect: [what will likely improve and by how much]
Risk: [what could go wrong or prevent success]

Do not write implementation protocols. Do not assign named owners. Do not set specific deadlines.
Advise on direction, not method.

Section 2, heading "Next Step" on its own line
Exactly 3 sentences:
Sentence 1: What this assessment has established.
Sentence 2: What remains to be measured as implementation progresses.
Sentence 3: Each action requires a confirmed owner and start date assigned by plant management before implementation begins.`
}