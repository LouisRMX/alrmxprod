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
      executive: `At 32 minutes, order-to-dispatch is more than double the 15-minute target, a gap of this size indicates the dispatch sequence is reactive rather than pre-planned, with trucks prepared after orders arrive rather than before.

A 17-minute excess on every departure compounds across the shift: combined with a 112-minute turnaround, each late departure delays the return and reload, reducing the number of cycles the fleet can complete. During the summer peak, when sites reject loads that arrive outside slump specification, the cost of each delayed departure is higher still.

Dispatch is the binding constraint because it directly gates how many cycles the fleet completes, regardless of other improvements. The 3.5% rejection rate is a real cost but affects a fraction of loads and does not limit throughput on its own. Fixing dispatch unlocks throughput across the entire 20-truck fleet; fixing quality or utilisation alone does not.`,

      diagnosis: `The dispatch constraint reduces the number of productive cycles the fleet can complete each shift, not because trucks are unavailable, but because each departure starts late and the delay carries through every subsequent cycle. At 20 trucks on a 112-minute cycle, a 17-minute departure excess represents roughly 1.3 fewer completed deliveries per truck per day, compressing output without any reduction in fleet size or plant capacity.

Fleet turnaround at 112 minutes is 28 minutes above the 84-minute benchmark for suburban Saudi delivery zones. Site wait time is the single largest component, driven by uncoordinated site handover and no demurrage enforcement. Turnaround cannot improve meaningfully until departures are on time, a truck leaving late arrives late and returns late, regardless of what happens at the site.

Quality at 70/100 and a 3.5% rejection rate are real costs, particularly during summer months when heat-related slump loss compounds the long cycle time. Production at 82/100 appears constrained, but utilisation is high precisely because the plant is producing to fill a queue that dispatch has already delayed.

If the dispatch gap closes to 15 minutes, the fleet recovers the cycle capacity to complete its target delivery volume within the existing shift. Turnaround improves as a secondary effect. No additional trucks or plant capacity are required, the throughput is already latent in the existing fleet.`,

      actions: `Immediate, this week
1. Dispatch pre-loading protocol: Before the morning shift starts, pre-load 3 trucks with the most likely first orders of the day. The dispatcher confirms which three before the first order arrives. Done when the morning queue time drops below 20 minutes.

2. Retarder protocol for summer loads: Flag all loads with expected site arrival after 10:00 AM during June–September. Batch plant operator confirms retarder addition before drum rotation starts. Done when the protocol is written and signed off by the batch supervisor.

3. Site-readiness confirmation: No truck dispatches until the site foreman sends a readiness message, WhatsApp, logged by time. The dispatcher holds the truck if no confirmation within 5 minutes of expected departure. Done when 90% of dispatches have a logged confirmation.

4. Order-to-dispatch tracking: Write the dispatch time on a whiteboard for every order, target 15 minutes, actual time, dispatcher initials. Review at end of shift. Done when the board is filled daily for one full week.

5. Rejection liability conversation: Identify the three contractors with the highest return rates. Have one direct conversation per week about shared liability on rejected loads. Done when at least one contractor acknowledges the clause in writing.

Short-term, weeks 2 to 4
1. Zone-based dispatch sequencing: Group consecutive orders by delivery area. The dispatcher fills a truck with two same-zone deliveries where possible. Reduces transit distance per cycle by an estimated 8–12 minutes for the suburban Saudi delivery pattern. Done when the dispatcher can describe the zone logic without prompting.

2. Weekly turnaround log: Record average turnaround time per shift for one full week. Identify whether the delay is occurring at the plant exit, at the delivery site, or in transit. Done when the log shows 5 consecutive days of data.

3. Preventive maintenance schedule: 4 breakdowns last month on a 20-truck fleet is above benchmark. Set a 4-week rotating service schedule for all trucks. Done when the schedule is posted and the first two trucks have been through it.

Validation, months 1 to 3
1. Dispatch time monthly average: Target 15 minutes by week 6. Track using the daily whiteboard log. If the average has not moved below 20 minutes by week 4, the pre-loading protocol is not being followed, investigate why.

2. Turnaround improvement: Target 84 minutes average by week 8. A 28-minute reduction is achievable through dispatch and site-readiness protocol alone, no fleet investment required. Track one full week of timestamped cycles.

3. 90-day tracking programme: Enrol in the tracking module to log turnaround and dispatch times weekly. After 8 weeks, the data supports a before-and-after case showing the exact financial recovery. This is the evidence base for any future decisions about fleet expansion or contract renegotiation.

Next Step
This pre-assessment has established the financial picture based on what the plant reports about itself: up to $85,000/month in recoverable margin, concentrated in dispatch and turnaround. What it cannot tell us is where in the 112-minute turnaround the time is actually being lost, whether the 32-minute dispatch figure reflects a consistent pattern or a peak-hour average, and whether rejections are primarily a plant-side dosing issue or a customer site-readiness issue. An on-site visit answers those three questions in half a day and produces a findings report the plant manager can act on the same week.`,
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

// ── Helper: TAT component breakdown (on-site only, validated) ──
function buildTATBreakdown(ctx: Record<string, unknown>): string | null {
  const transit = ctx.ta_transit_min as number | null
  const siteWait = ctx.ta_site_wait_min as number | null
  const unload = ctx.ta_unload_min as number | null
  const washout = ctx.ta_washout_return_min as number | null

  const components = [transit, siteWait, unload, washout]
  const filled = components.filter(v => v !== null && v !== undefined)

  // Require at least 3 of 4 components
  if (filled.length < 3) return null

  const reportedTotal = filled.reduce((a, b) => a + (b ?? 0), 0)
  const actualTA = ctx.turnaround as number

  // Sanity check: reject if component sum deviates >20% from dropdown-derived TAT
  // Note: the dropdown is the less precise source (25-min range), components are more reliable
  if (actualTA > 0 && Math.abs(reportedTotal - actualTA) / actualTA > 0.20) return null

  const largest = [
    { label: 'site wait', value: siteWait },
    { label: 'transit', value: transit },
    { label: 'unloading', value: unload },
    { label: 'washout/weighbridge', value: washout },
  ]
    .filter(x => x.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]

  return `TAT breakdown (on-site measurement, more precise than the dropdown-derived total):
  Transit (both ways): ${transit ?? 'not recorded'} min
  Site wait: ${siteWait ?? 'not recorded'} min
  Unloading: ${unload ?? 'not recorded'} min
  Washout/weighbridge: ${washout ?? 'not recorded'} min
  Component total: ${reportedTotal} min (dropdown TAT: ${actualTA} min)
  Largest component: ${largest.label} (${largest.value} min)
The TAT component breakdown is the more precise data source. The overall turnaround figure comes from a dropdown with a 25-minute range. If components sum within 20% of the dropdown value, trust the components. Name the dominant component directly and specifically.`
}

// ── Helper: Plant idle signal (on-site only) ──
function buildIdleSignal(ctx: Record<string, unknown>): string {
  const idle = ctx.plant_idle as string | null
  if (!idle) return ''

  // Options: 'Never, a truck is always available' | 'Occasionally, a few times per week' |
  //          'Regularly, most busy periods' | 'Every day, always waiting for trucks'
  const isNever = idle.toLowerCase().includes('never')
  if (isNever) return `Plant idle signal: plant does not report waiting for trucks. This does not rule out fleet constraint but reduces its likelihood.`

  const isRegular = idle.toLowerCase().includes('regularly') || idle.toLowerCase().includes('every day')
  const isOccasional = idle.toLowerCase().includes('occasionally')

  if (isRegular) return `Plant idle signal: plant reports sitting ready with no truck available — regularly (most busy periods) or every day. This confirms fleet is the binding constraint, not production capacity. Reference this directly when explaining the constraint mechanism.`
  if (isOccasional) return `Plant idle signal: plant reports occasionally waiting for trucks (a few times per week). This suggests fleet may be the binding constraint during peak periods but is not yet a persistent system-wide limit.`

  return ''
}

// ── Helper: biggest_pain free text (pre-assessment only, actions prompt only) ──
function buildPainContext(ctx: Record<string, unknown>): string {
  const pain = ctx.biggest_pain as string | null
  if (!pain || pain.trim().length < 10) return ''

  return `Plant manager's stated challenge (their own words): "${pain}"
Note: This is self-reported and may describe a symptom rather than the root cause. Use it to make the actions section feel plant-specific — reference it where it aligns with the data. If it contradicts the diagnostic findings, do not suppress it: briefly acknowledge the tension (e.g. "the plant manager identifies X as the main issue — the data suggests Y is upstream of that"). Paraphrase the concern in the report. Do not repeat exact phrasing from the input.`
}

// ── Helper: Dispatch context (on-site only, executive + diagnosis) ──
function buildDispatchContext(ctx: Record<string, unknown>): string {
  const clustering = ctx.route_clustering as string | null
  const notice = ctx.order_notice as string | null

  if (!clustering && !notice) return ''

  const lines = []
  if (clustering) lines.push(`Route clustering: ${clustering}`)
  if (notice) lines.push(`Customer order notice: ${notice}`)

  lines.push(`Note: Use these to explain the structural cause of dispatch delays. If clustering is absent and notice is short, the dispatch system is reactive by design — trucks are dispatched in response to demand rather than pre-positioned. Name this specifically if the data supports it.`)

  return lines.join('\n')
}

// ── Helper: Clustering signal for actions prompt ──
function buildClusteringSignal(ctx: Record<string, unknown>): string {
  const clustering = ctx.route_clustering as string | null
  if (!clustering) return ''

  // Options: 'Always, formal zone system' | 'Usually, informal grouping' |
  //          'Sometimes, depends on the dispatcher' | 'Rarely or never'
  const absent = clustering.toLowerCase().includes('sometimes') ||
                 clustering.toLowerCase().includes('rarely')

  if (!absent) return ''

  return `Route clustering: ${clustering}.
Note: Zone-based dispatch grouping is a zero-cost immediate action. Include it in the immediate actions section if dispatch is the primary constraint or a significant secondary issue. Frame it as a concrete protocol, not a general suggestion.`
}

function buildExecutivePrompt(ctx: Record<string, unknown>, benchmarks: BenchmarkContext | null = null) {
  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes, no numbered lists.
- Never invent data. Use only the figures provided.
- Do NOT repeat revenue figures, scores, or bullet metrics, those are already shown above this text in the UI.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive.
- Short sentences. One idea per sentence.
- If this text could apply to any ready-mix plant, it is too generic. Rewrite until it is specific to this plant.
- All analysis is based on reported input data. Do not present conclusions as absolute facts. Frame insights as data-consistent interpretations of the reported metrics.
- If TAT breakdown is absent or failed validation: do not speculate on which component drives the turnaround excess. State only that the breakdown was not recorded.`

  const tatBreakdown = buildTATBreakdown(ctx)
  const idleSignal = buildIdleSignal(ctx)
  const dispatchCtx = buildDispatchContext(ctx)

  if (ctx.performingWell) {
    return `${RULES}

You are writing a short operational explanation for a well-performing ready-mix concrete plant. The reader has already seen the scores and metrics. Your job is to explain in plain language why the plant is performing well and what operational discipline this reflects.

PLANT DATA:
Plant: ${ctx.plant}, ${ctx.country}
Overall score: ${ctx.overall}/100
Utilisation: ${ctx.utilPct}% (target: 85%) | Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)

WRITE THREE SHORT PARAGRAPHS, no headings, no labels:

Paragraph 1: What the data shows about operational flow. What is working at the process level, not just that the numbers are good, but what that implies about how the plant is run day-to-day.

Paragraph 2: Why this level of performance holds. What operational habits or disciplines are likely keeping these metrics stable.

Paragraph 3: What to monitor. One or two areas that could slip if not actively maintained. Specific to this plant's numbers.`
  }

  // ── PRE-ASSESSMENT EXECUTIVE: directional, no constraint label, ranges ──
  if (ctx.phase === 'workshop') {
    return `${RULES}

You are writing the initial analysis section of a Pre-Assessment Report for ${ctx.plant} in ${ctx.country}.

This is based on a small set of self-reported data points collected remotely. No on-site verification has been done.

CRITICAL CONSTRAINTS FOR PRE-ASSESSMENT:
- All figures are directional estimates, not confirmed values.
- Do NOT name a definitive constraint. Say "the data points toward [area] as the likely driver, to be confirmed on-site."
- Do NOT reference scores (xx/100). Do NOT reference TAT component breakdown (site wait, transit split).
- Use ranges: "between $${Math.round((ctx.totalLossMonthly as number) * 0.7 / 1000)}k and $${Math.round((ctx.totalLossMonthly as number) * 1.3 / 1000)}k per month" instead of a single figure.
- Frame all findings as preliminary: "the data suggests", "initial indicators point to", "based on reported figures".

PLANT DATA (self-reported, not verified):
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Dispatch time: ${ctx.dispatchMin ?? '-'} min (target: 15 min)
Rejection rate: ${ctx.rejectPct ?? '-'}% (target: <3%)
Utilisation: ${ctx.utilPct}% (target: 85%)
Fleet: ${ctx.trucks} trucks

WRITE EXACTLY TWO PARAGRAPHS. No headings. No bullets.

Paragraph 1: State what the reported data suggests about where operational margin is being lost. Name the likely area (turnaround, dispatch, quality, utilisation) but frame it as directional, not confirmed. Use the actual numbers vs targets to support the observation.

Paragraph 2: State what cannot be determined from remote data alone. Name 2-3 specific things the on-site assessment will clarify (e.g. where in the turnaround the time is physically lost, whether dispatch figures reflect a consistent pattern or peak-hour average, whether the constraint is fleet-side or production-side). End with one sentence framing the on-site visit as the logical next step.`
  }

  return `${RULES}

You are writing the Executive Explanation section of a Plant Intelligence Report for ${ctx.plant} in ${ctx.country}.

This is NOT a summary. Do not list findings. Do not repeat financial figures or scores, those are already shown above this text.

PURPOSE: Explain WHY the primary bottleneck occurs and HOW it constrains the operation. Cause-effect logic only.

PLANT DATA:
Primary bottleneck: ${ctx.bottleneck}
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
${tatBreakdown ?? ''}
Dispatch time: ${ctx.dispatchMin ?? '-'} min (target: 15 min)
${dispatchCtx}
Rejection rate: ${ctx.rejectPct ?? '-'}% (target: <3%)${ctx.rejectPlantFraction != null && (ctx.rejectPct as number) > 0 ? `
  → Plant-side: ~${ctx.rejectPlantFraction}% of rejections ($${ctx.rejectPlantSideLoss}/month), batch/dosing/mix quality
  → Customer-side: ~${100 - (ctx.rejectPlantFraction as number)}% of rejections ($${ctx.rejectCustomerSideLoss}/month), site unreadiness/pump delays/contractor` : ''}
Utilisation: ${ctx.utilPct}% (target: 85%)
Fleet: ${ctx.trucks} trucks
${idleSignal}
${benchmarks ? buildMarketContext(benchmarks) : ''}
WRITE EXACTLY THREE PARAGRAPHS. No headings. No bullets. No labels.

COMPRESSION RULES, strictly enforced:
- Each paragraph contains ONE core idea and ONE cause-effect relationship. Nothing else.
- Maximum 2–3 sentences per paragraph.
- No examples. No illustrative scenarios. No storytelling.
- No throat-clearing. Start with the operational fact.
- If a sentence does not add a new idea or new causal link, cut it.
- Prefer direct statements over explanations.
- Write the conclusion first in each paragraph, then support it briefly.

Paragraph 1: State the measured gap as a fact (use the actual metric vs target). Then state the most likely operational cause, framed as inference, not assertion. Use language like "indicates", "suggests", "points to". Do not claim to know what the plant does or does not have.

Paragraph 2: State the downstream consequence that follows directly from the gap in paragraph 1. Use only what the data confirms, turnaround time, cycle count, utilisation. Do not introduce specifics (shift length, number of deliveries) unless they appear in the plant data above.

Paragraph 3: State why this dimension is the binding constraint over the others. Reference ALL other dimensions that are off-target (e.g. rejection rate, utilisation, turnaround) and briefly state why each is secondary, either smaller financial gap, already partially constrained by the primary issue, or not yet at the point of system-wide impact. One sentence per secondary dimension. End with one sentence confirming why the primary constraint unlocks the most recovery.`
}

function buildDiagnosisPrompt(ctx: Record<string, unknown>, benchmarks: BenchmarkContext | null = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scores = ctx.scores as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const issues = ctx.issues as any[]

  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL, frame as "up to $X" or "recoverable", never as confirmed losses.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive.
- Short sentences. One idea per sentence.
- Write for a plant owner who is intelligent and has no patience for consultants who talk around things.
- All analysis is based on reported input data. Do not present conclusions as absolute facts. Frame insights as data-consistent interpretations of the reported metrics.
- Limit cognitive load. Avoid combining multiple operational dimensions in the same paragraph unless strictly necessary.
- If TAT breakdown is absent or failed validation: do not speculate on which component drives the turnaround excess. State only that the breakdown was not recorded.`

  const tatBreakdown = buildTATBreakdown(ctx)
  const idleSignal = buildIdleSignal(ctx)
  const dispatchCtx = buildDispatchContext(ctx)

  if (ctx.performingWell) {
    return `${RULES}

You are writing the Constraint Analysis section for a well-performing ready-mix concrete plant. No binding constraint was found. Your job is to explain what the absence of constraint indicates about how this operation is run.

PLANT DATA:
Plant: ${ctx.plant}, ${ctx.country}
Overall score: ${ctx.overall}/100
Utilisation: ${ctx.utilPct}% (target: 85%)
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Dispatch: ${ctx.dispatchMin ?? '-'} min (target: 15 min)
Scores, Production: ${scores?.prod ?? '-'}/100 | Dispatch: ${scores?.dispatch ?? '-'}/100 | Fleet: ${scores?.logistics ?? '-'}/100 | Quality: ${scores?.quality ?? '-'}/100

WRITE THREE PARAGRAPHS. No headings. No bullet points. No metric listings.

Paragraph 1, System state:
Describe what the operation looks like when no single dimension is constraining throughput. What does it mean for the whole system that turnaround, dispatch, and utilisation are all close to target simultaneously? One core idea. Max 3 sentences.

Paragraph 2, What the scores indicate:
Name the dimensions that are performing well and explain, in operational terms, not score terms, what that implies about the day-to-day discipline of the plant. Be specific to the actual numbers. Do not list scores. Weave them into a coherent observation. Max 3 sentences.

Paragraph 3, What to monitor:
Identify the one or two dimensions most likely to slip first if operational discipline softens, based on the actual metrics and their margin above target. One sentence per dimension. Conclude with what early signal would indicate the constraint is forming.`
  }

  // ── PRE-ASSESSMENT DIAGNOSIS: preliminary, no scores, no TAT components ──
  if (ctx.phase === 'workshop') {
    const totalLow = Math.round((ctx.totalLossMonthly as number) * 0.7 / 1000)
    const totalHigh = Math.round((ctx.totalLossMonthly as number) * 1.3 / 1000)

    return `${RULES}

You are writing the Preliminary Analysis section of a Pre-Assessment Report for ${ctx.plant} in ${ctx.country}.

This is based on self-reported data collected remotely. No on-site verification.

CRITICAL CONSTRAINTS FOR PRE-ASSESSMENT:
- Do NOT reference scores (xx/100). Do NOT reference TAT component breakdown.
- Do NOT name a definitive constraint. Use "likely" or "appears to be".
- Use ranges: "$${totalLow}k-$${totalHigh}k/month" not a single figure.
- Frame all analysis as preliminary.

PLANT DATA (self-reported, not verified):
Likely constraint area: ${ctx.bottleneck} (to be confirmed on-site)
Estimated recoverable range: $${totalLow}k-$${totalHigh}k/month
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Dispatch time: ${ctx.dispatchMin ?? '-'} min (target: 15 min)
Rejection rate: ${ctx.rejectPct ?? '-'}% (target: <3%)
Utilisation: ${ctx.utilPct}% (target: 85%)
Fleet: ${ctx.trucks} trucks

WRITE EXACTLY TWO PARAGRAPHS. No headings. No bullets.

Paragraph 1: Based on the reported metrics, describe what the numbers suggest about how the operation is performing. Name the 1-2 dimensions furthest from target and what that implies about daily operations. Use the actual numbers. Do not speculate on root causes that require on-site observation.

Paragraph 2: State what the on-site assessment will determine. Be specific: name 2-3 operational questions that can only be answered by observing the plant (e.g. actual truck cycle timing, dispatch behavior during peak hours, whether reported figures match typical days). Frame the on-site visit as converting this preliminary view into a validated diagnosis.`
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
      return `${d}: ${scoreMap[d] ?? '-'}/100`
    })
    .join(' · ')

  return `${RULES}

You are writing the Constraint Analysis section of a Plant Intelligence Report for ${ctx.plant} in ${ctx.country}.

IMPORTANT: The reader has already read "Why the operation is constrained", they know what the bottleneck is and how it occurs at the point of failure. Do NOT re-explain the bottleneck mechanism. Start from its consequences for the system as a whole.

PLANT DATA:
Primary constraint: ${bottleneck}
Bottleneck loss: up to $${ctx.bnLossMonthly}/month ($${ctx.bnDailyLoss}/day)
Total recoverable (all areas): up to $${ctx.totalLossMonthly}/month
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
${tatBreakdown ?? ''}
Dispatch time: ${ctx.dispatchMin ?? '-'} min (target: 15 min)
${dispatchCtx}
Rejection rate: ${ctx.rejectPct ?? '-'}% (target: <3%)${ctx.rejectPlantFraction != null && (ctx.rejectPct as number) > 0 ? `
  → Plant-side: ~${ctx.rejectPlantFraction}% ($${ctx.rejectPlantSideLoss}/month), batch/dosing/mix quality
  → Customer-side: ~${100 - (ctx.rejectPlantFraction as number)}% ($${ctx.rejectCustomerSideLoss}/month), site/pump/contractor` : ''}
Utilisation: ${ctx.utilPct}% (target: 85%)
Fleet: ${ctx.trucks} trucks
${idleSignal}
Scores, constraint: ${bottleneck} ${scores?.[bottleneck.toLowerCase() as keyof typeof scores] ?? (bottleneck === 'Fleet' ? scores?.logistics : null) ?? '-'}/100 | secondary: ${secondaryDims}
${benchmarks ? buildMarketContext(benchmarks) : ''}
WRITE 3–4 PARAGRAPHS. No headings. No bullet points. No findings. No metric listings.

Paragraph 1, System consequence:
State what happens to overall throughput and fleet utilisation as a result of the constraint.
Not what the constraint is, what it does to the system as a whole.
One core idea. One cause-effect chain. Max 3 sentences.

Paragraph 2, Why other dimensions are secondary:
For each underperforming dimension that is NOT the constraint, state in one sentence why fixing it first would not unlock system throughput.
Base this on the actual scores and metrics above.
Be direct: name each dimension and give a specific operational reason it is secondary.
Do not list them as bullets, weave them into prose.

Paragraph 3, What resolving the constraint enables:
If the constraint is fixed, what becomes operationally possible?
Do not state financial figures, focus on capacity, delivery cadence, and fleet utilisation.
Max 3 sentences. Conclusion first, then one supporting observation.

Paragraph 4 (include only if data supports it), Next constraint:
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
Utilisation: ${ctx.utilPct}%, target: 85%
Turnaround: ${ctx.turnaround} min, target: ${ctx.targetTA} min
Hidden revenue headroom: up to $${ctx.hiddenRevMonthly}/month

WRITE TWO SECTIONS:

One sentence (no heading): Name what the data confirms about this operation. What does the absence of major issues tell us? Specific to the numbers.

Next Step, heading on its own line
Exactly 3 sentences:
Sentence 1: What this assessment has confirmed.
Sentence 2: What an on-site visit would verify or add, not what it would fix, because nothing is obviously broken.
Sentence 3: A concrete suggestion for maintaining this performance, a monitoring discipline, periodic review, or one area to develop further.`
  }

  // ── PRE-ASSESSMENT ACTIONS: preparation only, no operational fixes ──
  if (ctx.phase === 'workshop') {
    const painCtx = buildPainContext(ctx)
    const totalLow = Math.round((ctx.totalLossMonthly as number) * 0.7 / 1000)
    const totalHigh = Math.round((ctx.totalLossMonthly as number) * 1.3 / 1000)

    return `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL RANGES, not confirmed.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable.
- Short sentences. One idea per sentence.
- Do not use sales pitch language.
- Do NOT recommend specific operational fixes (retarder protocols, demurrage enforcement, maintenance schedules). These require on-site verification.
- All actions must be preparation or measurement actions that the plant can do before the on-site visit.

You are writing the Preparation section of a Pre-Assessment Report for ${ctx.plant} in ${ctx.country}. This is based on self-reported data. No on-site visit has been done.

CONTEXT:
Likely constraint area: ${ctx.bottleneck} (to be confirmed)
Estimated recoverable range: $${totalLow}k-$${totalHigh}k/month
Turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Dispatch time: ${ctx.dispatchMin ?? '-'} min (target: 15 min)
Rejection rate: ${ctx.rejectPct ?? '-'}% (target: <3%)
${painCtx}
WRITE EXACTLY TWO SECTIONS:

Section 1, heading "Before the on-site visit" on its own line
3 to 5 numbered actions. Each must be:
- A measurement or data-gathering action (not an operational fix)
- Something the plant can start doing this week with zero cost
- Specific enough that someone knows whether it was done or not
Examples: start logging dispatch times on a whiteboard, pull last 3 months of rejection records, gather delivery ticket copies for one typical week, ask the dispatcher to note which trucks wait longest at plant queue.

Section 2, heading "Next Step" on its own line
Exactly 3 sentences:
Sentence 1: What this pre-assessment has established based on reported data, the estimated financial range at stake.
Sentence 2: What it cannot confirm yet. Name 2 specific unknowns that require on-site observation.
Sentence 3: The on-site assessment as the natural next step, framed as an observation, not a sales pitch.`
  }

  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes.
- Never invent data. Use only the figures provided.
- All financial figures are POTENTIAL, frame as "up to $X" or "recoverable", never as confirmed losses.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable.
- Short sentences. One idea per sentence.
- Do not use sales pitch language: propose, recommend, our team, we would like to.
- Warm, direct, experienced. The consultant has seen this pattern before.
- All analysis is based on reported input data. Do not present conclusions as absolute facts. Frame insights as data-consistent interpretations of the reported metrics.`

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
Dispatch time: ${ctx.dispatchMin ?? '-'} min (target: 15 min)
Rejection rate: ${ctx.rejectPct ?? '-'}% (target: <3%)

IMMEDIATE ACTIONS from the data (use these, add operational detail):
${immediateActions.join('\n')}

SECONDARY OPPORTUNITIES (brief mention only):
${secondaryIssues.join('\n')}
${buildPainContext(ctx)}
${buildClusteringSignal(ctx)}
WRITE EXACTLY FOUR SECTIONS:

Section 1, heading "Immediate, this week" on its own line
3 to 5 actions, each numbered. Each action must be:
- Specific to this plant's data (use the actual numbers)
- Measurable (the plant manager knows whether it happened or not)
- Zero capital, process, protocol, conversation, or instruction only
Format each action as: [Number]. [Action title]: [One sentence on what to do and how to confirm it is done.]

Section 2, heading "Short-term, weeks 2 to 4" on its own line
3 actions. These build on the immediate actions: SOPs, tracking systems, enforcement mechanisms. Same format as above.

Section 3, heading "Validation, months 1 to 3" on its own line
2 to 3 actions. These confirm the changes are holding and quantify the improvement. Include what to measure and how. Reference the 90-day tracking programme if the plant is enrolling.

Section 4, heading "Next Step" on its own line
Exactly 3 sentences:
Sentence 1: What this assessment has established, the financial picture based on what the plant reports about itself.
Sentence 2: What it cannot tell us yet. Specifically name 2 of the most relevant unknowns: actual dispatch sequence versus description; where in the turnaround the time is physically lost; whether rejections are plant-side or customer-side; how closely reported figures match typical days.
Sentence 3: The logical conclusion, framed as an obvious observation, not a proposal. The owner should finish reading this thinking "yes, that makes sense."

IMPORTANT: Secondary opportunities (${secondaryIssues.map(s => s.split(':')[0]).join(', ')}) should be mentioned briefly within the immediate or short-term sections where they fit naturally. Do not create a separate section for them.`
}