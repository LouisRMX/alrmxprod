import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { NextRequest, NextResponse } from 'next/server'

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

  // Demo mode: return fixed pre-written report text, no database access needed
  // Skip when demoOverride === true (user has changed inputs and wants a live generation)
  if (assessmentId === 'demo' && !demoOverride) {
    const DEMO_TEXTS: Record<string, string> = {
      executive: `At 32 minutes, order-to-dispatch is more than double the 15-minute target. A gap this wide points to a reactive sequence — the current spreadsheet-and-WhatsApp workflow cannot pace 86 daily departures without building queues, because each order is confirmed and loaded after arrival rather than batched ahead of the shift.

The delay carries through every cycle. With turnaround already at 112 minutes — 28 minutes above the 84-minute target for suburban Riyadh — each late departure adds to the return delay rather than absorbing it. The fleet runs fewer cycles than its 17 operative trucks would allow if departures started on schedule. During summer, the compounding effect is sharper: loads batched before 09:00 that spend 32 minutes waiting for dispatch arrive outside slump specification, driving the 3.5% rejection rate.

Dispatch is the binding constraint because it gates every other metric simultaneously. Fleet turnaround is partly a downstream consequence — trucks that leave late face the same site conditions regardless of what changes at the delivery end. The rejection rate from heat and slump loss in transit is a real cost, but it cannot be resolved by fixing dispatch alone; it requires a separate retarder protocol. Fixing dispatch unlocks throughput across all 17 operative trucks without additional fleet investment. No other single change does that.`,

      diagnosis: `The dispatch gap does not just delay individual loads — it compresses the number of cycles each truck completes in a shift. At 86 deliveries per day across 17 operative trucks, a 17-minute average departure excess means each truck finishes fewer cycles than the 112-minute turnaround would otherwise allow. The effect accumulates within each truck's daily sequence: the first late departure pushes the second, and so on through the shift.

Quality at 70/100 and a 3.5% rejection rate represent the second pressure point. The identified cause — heat and slump loss during transit, concentrated in loads batched before 09:00 that arrive outside specification at peak summer sites — is both a plant-side and a logistics problem. Batching earlier is not a fix if trucks still queue before departure; the load ages in the drum while the spreadsheet-WhatsApp sequence resolves. This requires two separate interventions: a dispatch improvement that reduces pre-departure wait, and a targeted retarder protocol for early morning summer loads.

Fleet turnaround at 112 minutes sits 28 minutes above target. Site wait at 52 minutes — 17 minutes above the 35-minute benchmark — is the largest single component. Reducing site wait requires pre-departure readiness confirmation, which depends on a more controlled dispatch sequence. The two constraints are linked: dispatch improvement is a precondition for meaningful turnaround reduction, not a parallel track.

If dispatch closes to 15 minutes, trucks begin each cycle with the full shift available. Turnaround improvement follows as a secondary effect — trucks that arrive on schedule face less accumulated delay from earlier queues. The 82/100 production score and high utilisation are not the constraint; the plant is already producing to fill a queue that dispatch has delayed. No fleet changes are required; the capacity is available in the existing 17 operative trucks.`,

      actions: `Immediate — this week
1. Pre-load the first two trucks before shift start: The dispatcher confirms the two most likely first orders by 06:45 each morning using the existing order list. Batch operator loads before 07:00. Done when both trucks depart within 15 minutes of shift start for five consecutive days.

2. Retarder protocol for early summer loads: All loads batched before 09:00 during June-September receive a standard retarder dose. Batch operator confirms addition before drum rotation. Done when the protocol is written, signed by the batch supervisor, and applied to every qualifying load for one week.

3. Site-readiness confirmation before dispatch: No truck departs until the site foreman sends a confirmation via the existing WhatsApp line, time-logged by the dispatcher. Trucks held if no confirmation within five minutes of scheduled departure. Done when 80% of daily dispatches have a logged confirmation time.

4. Dispatch time log: The dispatcher records actual order-to-dispatch time for every load on a whiteboard — target 15 minutes, actual time, dispatcher initials. Reviewed at end of shift. Done when the board is completed for five consecutive days.

5. Rejection liability: Identify the three contractors with the highest return rates from the past month. Discuss the demurrage clause directly. Done when at least one contractor acknowledges it in writing.

Short-term — weeks 2 to 4
1. Replace the WhatsApp group with individual driver SMS: The dispatcher sends departure instructions directly to each driver rather than posting to the group. Eliminates read-receipt ambiguity and removes manual spreadsheet steps from the current sequence. Done when the dispatcher runs five consecutive shifts without the group for internal dispatch coordination.

2. Zone-based morning batching: Group the first 12 orders of each shift by delivery zone. Dispatcher fills trucks with same-zone loads where possible, reducing average transit distance per cycle. Done when the dispatcher applies the zone sequence to three consecutive morning shifts without prompting.

3. Enforce demurrage on one load: Select the next rejected load from a contractor with a signed clause. Issue the invoice. Done when the contractor receives it.

Validation — months 1 to 3
1. Dispatch time weekly average: Target below 20 minutes by week 4, below 15 minutes by week 6. Track using the dispatcher's daily log. If week 4 average has not moved, the pre-loading protocol is not being followed consistently — check which shift is lagging.

2. Turnaround: Target 84 minutes by week 8. A 28-minute reduction is achievable through dispatch improvement and site-readiness protocol alone — no fleet changes required. Track using timestamped departure and return logs, one full week per month.

3. Rejection rate: Target below 2.5% by month 3. If summer heat loads remain above 3%, the retarder protocol is not being applied consistently — pull batch records for loads departing before 09:00.

Next Step
This assessment has established the financial picture based on what Al-Noor reports about itself: up to $115,000 per month in recoverable margin, concentrated in dispatch and its downstream effect on turnaround. What it cannot confirm is where in the 112-minute turnaround the time is physically being lost, whether the 32-minute dispatch figure holds across all shifts or peaks on specific days, and whether the summer rejection pattern is driven primarily by batching time or by transit distance to particular sites. An on-site half-day answers those three questions and produces a findings report the plant manager can act on the same week.`,
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

  // Verify assessment exists and user has access (skipped for demo override — no DB record)
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

  const prompts: Record<string, string> = {
    executive: buildExecutivePrompt(context, benchmarks),
    diagnosis: buildDiagnosisPrompt(context, benchmarks),
    actions: buildActionsPrompt(context),
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

        // Save to database when complete — skipped for demo override (no persistent record)
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

function buildQualContext(ctx: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (ctx.answers ?? {}) as Record<string, string>
  const lines: string[] = []
  if (a.dispatch_tool)    lines.push(`Dispatch tool in use: "${a.dispatch_tool}"`)
  if (a.route_clustering) lines.push(`Route clustering practice: "${a.route_clustering}"`)
  if (a.site_wait_reason) lines.push(`Named cause of site wait: "${a.site_wait_reason}"`)
  if (a.reject_reason)    lines.push(`Named cause of rejections: "${a.reject_reason}"`)
  if (a.slump_test)       lines.push(`Slump test practice: "${a.slump_test}"`)
  if (a.calibration)      lines.push(`Calibration practice: "${a.calibration}"`)
  if (a.plant_idle)       lines.push(`Plant idle pattern: "${a.plant_idle}"`)
  if (!lines.length) return ''
  return `\nOPERATIONS CONTEXT (use these exact names when referencing tools or causes):\n${lines.join('\n')}`
}

function buildMarketContext(b: BenchmarkContext): string {
  return `
MARKET CONTEXT (${b.n} comparable plants — similar fleet size and delivery radius):
Turnaround — median: ${b.turnaround.p50} min · top quartile: ${b.turnaround.p25} min
Dispatch   — median: ${b.dispatch.p50} min · top quartile: ${b.dispatch.p25} min
Rejection  — median: ${b.reject.p50}% · top quartile: ${b.reject.p25}%

When this data is available, reference the plant's position relative to comparable operations. Use language like "comparable plants" or "similar operations in this segment". Do not call it an "industry average". Be direct: if the plant is below median on a key metric, state it.`
}

function buildExecutivePrompt(ctx: Record<string, unknown>, benchmarks: BenchmarkContext | null = null) {
  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes, no numbered lists.
- Never invent data. Use only the figures provided.
- Do NOT repeat revenue figures, scores, or bullet metrics — those are already shown above this text in the UI.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive.
- Short sentences. One idea per sentence.
- If this text could apply to any ready-mix plant, it is too generic. Rewrite until it is specific to this plant.
- All analysis is based on reported input data. Do not present conclusions as absolute facts. Frame insights as data-consistent interpretations of the reported metrics.`

  if (ctx.performingWell) {
    return `${RULES}

You are writing a short operational explanation for a well-performing ready-mix concrete plant. The reader has already seen the scores and metrics. Your job is to explain in plain language why the plant is performing well and what operational discipline this reflects.

PLANT DATA:
Plant: ${ctx.plant}, ${ctx.country}
Overall score: ${ctx.overall}/100
Utilisation: ${ctx.utilPct}% (target: 85%) | Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)

WRITE THREE SHORT PARAGRAPHS — no headings, no labels:

Paragraph 1: What the data shows about operational flow. What is working at the process level — not just that the numbers are good, but what that implies about how the plant is run day-to-day.

Paragraph 2: Why this level of performance holds. What operational habits or disciplines are likely keeping these metrics stable.

Paragraph 3: What to monitor. One or two areas that could slip if not actively maintained. Specific to this plant's numbers.`
  }

  return `${RULES}

You are writing the Executive Explanation section of a Plant Intelligence Report for ${ctx.plant} in ${ctx.country}.

This is NOT a summary. Do not list findings. Do not repeat financial figures or scores — those are already shown above this text.

PURPOSE: Explain WHY the primary bottleneck occurs and HOW it constrains the operation. Cause-effect logic only.

PLANT DATA:
Primary bottleneck: ${ctx.bottleneck}
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Dispatch time: ${ctx.dispatchMin ?? '—'} min (target: 15 min)
Rejection rate: ${ctx.rejectPct ?? '—'}% (target: <3%)${ctx.rejectPlantFraction != null && (ctx.rejectPct as number) > 0 ? `
  → Plant-side: ~${ctx.rejectPlantFraction}% of rejections ($${ctx.rejectPlantSideLoss}/month) — batch/dosing/mix quality
  → Customer-side: ~${100 - (ctx.rejectPlantFraction as number)}% of rejections ($${ctx.rejectCustomerSideLoss}/month) — site unreadiness/pump delays/contractor` : ''}
Utilisation: ${ctx.utilPct}% (target: 85%)
Fleet: ${ctx.trucks} trucks${buildQualContext(ctx)}
${benchmarks ? buildMarketContext(benchmarks) : ''}
WRITE EXACTLY THREE PARAGRAPHS. No headings. No bullets. No labels.

COMPRESSION RULES — strictly enforced:
- Each paragraph contains ONE core idea and ONE cause-effect relationship. Nothing else.
- Maximum 2–3 sentences per paragraph.
- No examples. No illustrative scenarios. No storytelling.
- No throat-clearing. Start with the operational fact.
- If a sentence does not add a new idea or new causal link, cut it.
- Prefer direct statements over explanations.
- Write the conclusion first in each paragraph, then support it briefly.

Paragraph 1: State the measured gap as a fact (use the actual metric vs target). Then state the most likely operational cause — framed as inference, not assertion. Use language like "indicates", "suggests", "points to". Do not claim to know what the plant does or does not have.

Paragraph 2: State the downstream consequence that follows directly from the gap in paragraph 1. Use only what the data confirms — turnaround time, cycle count, utilisation. Do not introduce specifics (shift length, number of deliveries) unless they appear in the plant data above.

Paragraph 3: State why this dimension is the binding constraint over the others. Reference ALL other dimensions that are off-target (e.g. rejection rate, utilisation, turnaround) and briefly state why each is secondary — either smaller financial gap, already partially constrained by the primary issue, or not yet at the point of system-wide impact. One sentence per secondary dimension. End with one sentence confirming why the primary constraint unlocks the most recovery.`
}

function buildDiagnosisPrompt(ctx: Record<string, unknown>, benchmarks: BenchmarkContext | null = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scores = ctx.scores as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const issues = ctx.issues as any[]

  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL — frame as "up to $X" or "recoverable", never as confirmed losses.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive.
- Short sentences. One idea per sentence.
- Write for a plant owner who is intelligent and has no patience for consultants who talk around things.
- All analysis is based on reported input data. Do not present conclusions as absolute facts. Frame insights as data-consistent interpretations of the reported metrics.
- Limit cognitive load. Avoid combining multiple operational dimensions in the same paragraph unless strictly necessary.`

  if (ctx.performingWell) {
    return `${RULES}

You are writing the Constraint Analysis section for a well-performing ready-mix concrete plant. No binding constraint was found. Your job is to explain what the absence of constraint indicates about how this operation is run.

PLANT DATA:
Plant: ${ctx.plant}, ${ctx.country}
Overall score: ${ctx.overall}/100
Utilisation: ${ctx.utilPct}% (target: 85%)
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Dispatch: ${ctx.dispatchMin ?? '—'} min (target: 15 min)
Scores — Production: ${scores?.prod ?? '—'}/100 | Dispatch: ${scores?.dispatch ?? '—'}/100 | Fleet: ${scores?.logistics ?? '—'}/100 | Quality: ${scores?.quality ?? '—'}/100

WRITE THREE PARAGRAPHS. No headings. No bullet points. No metric listings.

Paragraph 1 — System state:
Describe what the operation looks like when no single dimension is constraining throughput. What does it mean for the whole system that turnaround, dispatch, and utilisation are all close to target simultaneously? One core idea. Max 3 sentences.

Paragraph 2 — What the scores indicate:
Name the dimensions that are performing well and explain — in operational terms, not score terms — what that implies about the day-to-day discipline of the plant. Be specific to the actual numbers. Do not list scores. Weave them into a coherent observation. Max 3 sentences.

Paragraph 3 — What to monitor:
Identify the one or two dimensions most likely to slip first if operational discipline softens — based on the actual metrics and their margin above target. One sentence per dimension. Conclude with what early signal would indicate the constraint is forming.`
  }

  const bottleneck = ctx.bottleneck as string
  const secondaryDims = ['Dispatch', 'Fleet', 'Quality', 'Production']
    .filter(d => d !== bottleneck)
    .map(d => {
      const scoreMap: Record<string, number | null> = {
        Dispatch: scores?.dispatch ?? null,
        Fleet: scores?.logistics ?? null,
        Quality: scores?.quality ?? null,
        Production: scores?.prod ?? null,
      }
      return `${d}: ${scoreMap[d] ?? '—'}/100`
    })
    .join(' · ')

  return `${RULES}

You are writing the Constraint Analysis section of a Plant Intelligence Report for ${ctx.plant} in ${ctx.country}.

IMPORTANT: The reader has already read "Why the operation is constrained" — they know what the bottleneck is and how it occurs at the point of failure. Do NOT re-explain the bottleneck mechanism. Start from its consequences for the system as a whole.

PLANT DATA:
Primary constraint: ${bottleneck}
Bottleneck loss: up to $${ctx.bnLossMonthly}/month ($${ctx.bnDailyLoss}/day)
Total recoverable (all areas): up to $${ctx.totalLossMonthly}/month
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Dispatch time: ${ctx.dispatchMin ?? '—'} min (target: 15 min)
Rejection rate: ${ctx.rejectPct ?? '—'}% (target: <3%)${ctx.rejectPlantFraction != null && (ctx.rejectPct as number) > 0 ? `
  → Plant-side: ~${ctx.rejectPlantFraction}% ($${ctx.rejectPlantSideLoss}/month) — batch/dosing/mix quality
  → Customer-side: ~${100 - (ctx.rejectPlantFraction as number)}% ($${ctx.rejectCustomerSideLoss}/month) — site/pump/contractor` : ''}
Utilisation: ${ctx.utilPct}% (target: 85%)
Fleet: ${ctx.trucks} trucks
Scores — constraint: ${bottleneck} ${scores?.[bottleneck.toLowerCase() as keyof typeof scores] ?? (bottleneck === 'Fleet' ? scores?.logistics : null) ?? '—'}/100 | secondary: ${secondaryDims}${buildQualContext(ctx)}
${benchmarks ? buildMarketContext(benchmarks) : ''}
WRITE 3–4 PARAGRAPHS. No headings. No bullet points. No findings. No metric listings.

Paragraph 1 — System consequence:
State what happens to overall throughput and fleet utilisation as a result of the constraint.
Not what the constraint is — what it does to the system as a whole.
One core idea. One cause-effect chain. Max 3 sentences.

Paragraph 2 — Why other dimensions are secondary:
For each underperforming dimension that is NOT the constraint, state in one sentence why fixing it first would not unlock system throughput.
Base this on the actual scores and metrics above.
Be direct: name each dimension and give a specific operational reason it is secondary.
Do not list them as bullets — weave them into prose.

Paragraph 3 — What resolving the constraint enables:
If the constraint is fixed, what becomes operationally possible?
Do not state financial figures — focus on capacity, delivery cadence, and fleet utilisation.
Max 3 sentences. Conclusion first, then one supporting observation.

Paragraph 4 (include only if data supports it) — Next constraint:
If another dimension is close to becoming the binding limit once the primary is resolved, name it and explain why in 1–2 sentences.
Only include this paragraph if a secondary score is below 65 or a metric is meaningfully off-target.`
}

function buildActionsPrompt(ctx: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const issues = ctx.issues as any[]

  if (ctx.performingWell) {
    return `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Do not manufacture urgency that does not exist.
- Short sentences. One idea per sentence.
- Do not use: optimize, leverage, streamline, robust, synergy, utilize, actionable.

You are writing the Next Step section of a Plant Intelligence Report for a well-performing ready-mix concrete plant. No significant losses were found.

CONTEXT:
Plant: ${ctx.plant}, ${ctx.country}
Overall score: ${ctx.overall}/100
Utilisation: ${ctx.utilPct}% — target: 85%
Turnaround: ${ctx.turnaround} min — target: ${ctx.targetTA} min
Hidden revenue headroom: up to $${ctx.hiddenRevMonthly}/month

WRITE TWO SECTIONS:

One sentence (no heading): Name what the data confirms about this operation. What does the absence of major issues tell us? Specific to the numbers.

Next Step — heading on its own line
Exactly 3 sentences:
Sentence 1: What this assessment has confirmed.
Sentence 2: What an on-site visit would verify or add — not what it would fix, because nothing is obviously broken.
Sentence 3: A concrete suggestion for maintaining this performance — a monitoring discipline, periodic review, or one area to develop further.`
  }

  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL — frame as "up to $X" or "recoverable", never as confirmed losses.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable.
- Short sentences. One idea per sentence.
- Do not use sales pitch language: propose, recommend, our team, we would like to.
- Warm, direct, experienced. The consultant has seen this pattern before.
- All analysis is based on reported input data. Do not present conclusions as absolute facts. Frame insights as data-consistent interpretations of the reported metrics.
- If OPERATIONS CONTEXT names a tool, cause, or practice, use that exact name when writing actions that address it. Generic phrasing ("use a better system", "address the root cause") is not allowed when the specific name is known.`

  const topIssues = issues
    .filter(i => i.loss > 0)
    .slice(0, 5)

  const immediateActions = topIssues
    .filter(i => i.sev === 'high' || i.loss > 5000)
    .slice(0, 3)
    .map(i => `${i.t}: ${i.action} (up to $${Math.round(i.loss / 1000)}k/month)`)

  const secondaryIssues = topIssues
    .filter(i => i.dimension !== ctx.bottleneck && i.loss > 0)
    .slice(0, 2)
    .map(i => `${i.t}: up to $${Math.round(i.loss / 1000)}k/month`)

  return `${RULES}

You are writing the Actions section of a Plant Intelligence Report for ${ctx.plant} in ${ctx.country}. This report will be reviewed by the consultant, then presented to the plant owner before any on-site visit.

CONTEXT:
Primary bottleneck: ${ctx.bottleneck}
Bottleneck loss: up to $${ctx.bnLossMonthly}/month
Total recoverable: up to $${ctx.totalLossMonthly}/month
Overall score: ${ctx.overall}/100
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Dispatch time: ${ctx.dispatchMin ?? '—'} min (target: 15 min)
Rejection rate: ${ctx.rejectPct ?? '—'}% (target: <3%)${buildQualContext(ctx)}

IMMEDIATE ACTIONS from the data (use these, add operational detail):
${immediateActions.join('\n')}

SECONDARY OPPORTUNITIES (brief mention only):
${secondaryIssues.join('\n')}

WRITE EXACTLY FOUR SECTIONS:

Section 1 — heading "Immediate — this week" on its own line
3 to 5 actions, each numbered. Each action must be:
- Specific to this plant's data (use the actual numbers)
- Measurable (the plant manager knows whether it happened or not)
- Zero capital — process, protocol, conversation, or instruction only
Format each action as: [Number]. [Action title]: [One sentence on what to do and how to confirm it is done.]

Section 2 — heading "Short-term — weeks 2 to 4" on its own line
3 actions. These build on the immediate actions: SOPs, tracking systems, enforcement mechanisms. Same format as above.

Section 3 — heading "Validation — months 1 to 3" on its own line
2 to 3 actions. These confirm the changes are holding and quantify the improvement. Include what to measure and how. Reference the 90-day tracking programme if the plant is enrolling.

Section 4 — heading "Next Step" on its own line
Exactly 3 sentences:
Sentence 1: What this assessment has established — the financial picture based on what the plant reports about itself.
Sentence 2: What it cannot tell us yet. Specifically name 2 of the most relevant unknowns: actual dispatch sequence versus description; where in the turnaround the time is physically lost; whether rejections are plant-side or customer-side; how closely reported figures match typical days.
Sentence 3: The logical conclusion — framed as an obvious observation, not a proposal. The owner should finish reading this thinking "yes, that makes sense."

IMPORTANT: Secondary opportunities (${secondaryIssues.map(s => s.split(':')[0]).join(', ')}) should be mentioned briefly within the immediate or short-term sections where they fit naturally. Do not create a separate section for them.`
}