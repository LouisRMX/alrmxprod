import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

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

  // Demo mode: return fixed pre-written report text, no database access needed
  if (assessmentId === 'demo') {
    const DEMO_TEXTS: Record<string, string> = {
      executive: `The dispatch sequence is reactive: orders are processed individually as they arrive, with no pre-loading or zone anticipation, which causes a 17-minute structural delay on every departure.

Each delayed departure compresses the remaining shift: on a 95-minute cycle, a truck leaving 17 minutes late completes one fewer delivery by end of day, reducing effective fleet output without any truck being unavailable.

Dispatch is the binding constraint because production capacity is underutilised and the fleet is physically capable of more cycles — the limit is not output or vehicle count, it is departure rate.`,

      diagnosis: `Performance Scores
Production: 82/100
What this means: The plant is running at 89% utilisation — close to the 85% target, but this figure is misleading. Apparent capacity use is high because the constraint is downstream in dispatch and fleet, not at the batch plant itself.

Dispatch: 52/100
What this means: At 32 minutes average order-to-dispatch, the plant is more than double the 15-minute target. This is the single largest controllable gap in the operation and the primary financial driver.

Fleet: 61/100
What this means: A 95-minute turnaround on a 10 km delivery radius is 20 minutes above the 75-minute benchmark. Each excess minute represents capacity the fleet cannot convert into deliveries.

Quality: 71/100
What this means: A 3.8% rejection rate is 0.8 percentage points above the 3% benchmark. At full plant liability for returned loads, this represents $18,400/month in write-offs — real but secondary to the dispatch and turnaround problem.

Overall: 75/100
The plant has the infrastructure to perform significantly above its current level. The constraint is operational rhythm, not installed capacity.

Primary constraint: Dispatch
The 32-minute order-to-dispatch cycle is preventing the fleet from maintaining the delivery cadence needed to fill available capacity. Every delayed departure cascades into a longer afternoon queue and fewer completed cycles per shift.

Dispatch — Primary Constraint
Order-to-dispatch averages 32 minutes against a 15-minute target — a 17-minute gap on every order. There is no pre-loading protocol, no zone routing, and no real-time tracking: the dispatcher reacts to each order individually rather than anticipating the next. This creates a compounding delay through the shift: trucks queue at departure rather than at delivery sites, which is the more expensive place to wait. The financial consequence is up to $71,000/month in recoverable margin — driven entirely by the time between order confirmation and truck departure.

Findings
Finding: Order-to-dispatch averaging 32 minutes against a 15-minute target — the longest controllable gap in the dispatch chain.
Benchmark: Well-run plants dispatch within 10–15 minutes of order confirmation using pre-loading and zone sequencing.
Gap: 17 minutes excess per order × 42 deliveries/day × 22 operating days.
Impact: up to $71,000/month
Action: Pre-load 3 trucks before the morning peak. Assign one dispatcher whose only metric is order-to-dispatch time, logged daily on a whiteboard visible to the shift supervisor.

Finding: Truck turnaround 95 minutes against a 75-minute benchmark for a 10 km delivery radius.
Benchmark: Well-run plants on a 10 km radius achieve 75–82 minute round trips through site-readiness protocols and enforced demurrage.
Gap: 20 minutes excess per cycle × 42 deliveries/day × 22 days.
Impact: up to $46,200/month (partially overlapping with dispatch finding)
Action: Require site-readiness confirmation before dispatch. No truck leaves until the pump crew and foreman confirm ready — logged by the dispatcher with a timestamp.

Finding: 3.8% rejection rate with plant absorbing 100% of material costs.
Benchmark: Well-run plants hold rejections below 3% and include material cost recovery clauses in standard contracts.
Gap: 0.8 percentage points above benchmark × 42 deliveries × 7 m³ × $68/m³ plant cost.
Impact: up to $18,400/month
Action: Enforce retarder dosage protocol on all loads with transit time over 35 minutes. Add a material cost clause to the next three contract renewals.

Finding: Average load 6.5 m³ on 7 m³ trucks — 7% of mixer capacity unused per trip.
Benchmark: Well-run plants achieve above 6.8 m³ average through minimum batch policies or small-load surcharges.
Gap: 0.5 m³ × 42 deliveries/day × 22 days = 462 m³/month unbilled.
Impact: up to $9,100/month
Action: Set a minimum batch size of 6.8 m³ or introduce a below-threshold surcharge. Implement in the next contract renewal cycle.`,

      actions: `Immediate — this week
1. Dispatch pre-loading protocol: Before the morning shift starts, pre-load 3 trucks with the most likely first orders of the day. The dispatcher confirms which three before the first order arrives. Done when the morning queue time drops below 20 minutes.

2. Site-readiness confirmation: No truck dispatches until the site foreman sends a readiness message — WhatsApp, logged by time. The dispatcher holds the truck if no confirmation within 5 minutes of expected departure. Done when 90% of dispatches have a logged confirmation.

3. Order-to-dispatch tracking: Write the dispatch time on a whiteboard for every order — target 15 minutes, actual time, dispatcher initials. Review at end of shift. Done when the board is filled daily for one full week.

4. Retarder protocol for long-haul loads: Flag any load with expected transit over 35 minutes. Batch plant operator confirms retarder addition before drum rotation starts. Done when the protocol is written and signed off by the batch supervisor.

5. Rejection liability conversation: Identify the three contractors with the highest return rates. Have one direct conversation per week about shared liability on rejected loads. Done when at least one contractor acknowledges the clause in writing.

Short-term — weeks 2 to 4
1. Zone-based dispatch sequencing: Group consecutive orders by delivery area. The dispatcher fills a truck with two same-zone deliveries where possible. Reduces transit distance per cycle by an estimated 8–12 minutes. Done when the dispatcher can describe the zone logic without prompting.

2. Weekly turnaround log: Record average turnaround time per shift for one full week. Identify whether the delay is occurring at the plant exit, at the delivery site, or in transit. This tells us where to act next. Done when the log shows 5 consecutive days of data.

3. Maintenance schedule for reactive breakdowns: 3 breakdowns last month on 10 trucks is above the 2/month benchmark for a maintained fleet. Set a 4-week rotating service schedule for all trucks. Done when the schedule is posted and the first two trucks have been through it.

Validation — months 1 to 3
1. Dispatch time monthly average: Target 15 minutes by week 6. Track using the daily whiteboard log. If the average has not moved below 20 minutes by week 4, the pre-loading protocol is not being followed — investigate why.

2. Turnaround improvement: Target 78 minutes average by week 8. A 17-minute reduction from 95 minutes is achievable through dispatch and site-readiness protocol alone — no fleet investment required. Track one full week of timestamped cycles.

3. 90-day tracking programme: Enrol in the tracking module to log turnaround and dispatch times weekly. After 8 weeks, the data supports a before-and-after case showing the exact financial recovery. This is the evidence base for any future decisions about fleet expansion or contract renegotiation.

Next Step
This pre-assessment has established the financial picture based on what Al-Noor reports about itself: up to $94,000/month in recoverable margin, concentrated in dispatch and turnaround. What it cannot tell us is where in the 95-minute turnaround the time is actually being lost — whether the 32-minute dispatch figure reflects a consistent pattern or a peak-hour average, and whether rejections are primarily a plant-side dosing issue or a customer site-readiness issue. An on-site visit answers those three questions in half a day and produces a findings report the plant manager can act on the same week.`,
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

  // Verify assessment exists and user has access
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id')
    .eq('id', assessmentId)
    .single()

  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })

  const prompts: Record<string, string> = {
    executive: buildExecutivePrompt(context),
    diagnosis: buildDiagnosisPrompt(context),
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

        // Save to database when complete — strip markdown before persisting
        const fullText = stripMarkdown(await response.finalText())
        await supabase.from('reports').upsert({
          assessment_id: assessmentId,
          [type]: fullText,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id' })

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

function buildExecutivePrompt(ctx: Record<string, unknown>) {
  const RULES = `RULES:
- Plain text only. No markdown, no asterisks, no bold, no headings with #, no bullet dashes, no numbered lists.
- Never invent data. Use only the figures provided.
- Do NOT repeat revenue figures, scores, or bullet metrics — those are already shown above this text in the UI.
- No jargon. Banned: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive.
- Short sentences. One idea per sentence.
- If this text could apply to any ready-mix plant, it is too generic. Rewrite until it is specific to this plant.`

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
Rejection rate: ${ctx.rejectPct ?? '—'}% (target: <3%)
Utilisation: ${ctx.utilPct}% (target: 85%)
Fleet: ${ctx.trucks} trucks

WRITE EXACTLY THREE PARAGRAPHS. No headings. No bullets. No labels.

COMPRESSION RULES — strictly enforced:
- Each paragraph contains ONE core idea and ONE cause-effect relationship. Nothing else.
- Maximum 2–3 sentences per paragraph.
- No examples. No illustrative scenarios. No storytelling.
- No throat-clearing. Start with the operational fact.
- If a sentence does not add a new idea or new causal link, cut it.
- Prefer direct statements over explanations.
- Write the conclusion first in each paragraph, then support it briefly.

Paragraph 1: State what is structurally broken in the operational flow. One cause, one effect. No elaboration.

Paragraph 2: State the downstream consequence. What cannot happen because of the failure in paragraph 1. Direct causal chain only.

Paragraph 3: State why this is the binding constraint and not another dimension. One reason. One sentence of supporting logic. Stop.`
}

function buildDiagnosisPrompt(ctx: Record<string, unknown>) {
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
- Write for a plant owner who is intelligent and has no patience for consultants who talk around things.`

  if (ctx.performingWell) {
    return `${RULES}

You are writing the Operational Diagnosis section for a well-performing ready-mix concrete plant. The assessment found no significant financial losses. Your job is to explain what is working well and what to monitor.

SCORES:
Production: ${scores?.prod ?? '—'}/100
Dispatch: ${scores?.dispatch ?? '—'}/100
Fleet: ${scores?.logistics ?? '—'}/100
Quality: ${scores?.quality ?? '—'}/100
Overall: ${ctx.overall}/100

KEY METRICS:
Utilisation: ${ctx.utilPct}% — target: 85%
Turnaround: ${ctx.turnaround} min — target: ${ctx.targetTA} min
Fleet: ${ctx.trucks} trucks

WRITE TWO SECTIONS:

Performance Scores — heading on its own line
For each dimension write one line: [Dimension]: [Score]/100
Followed by one sentence: What this means: [specific to this plant's actual numbers, not a generic definition]

Overall: ${ctx.overall}/100 — one sentence on what this means for the plant as a whole.

What Is Working — heading on its own line
3 to 4 sentences describing the operational strengths. Be specific. Reference actual numbers. Identify anything that could slip if not actively maintained.`
  }

  const topIssues = issues
    .filter(i => i.loss > 0)
    .slice(0, 4)

  const findingsJson = topIssues.map(i => ({
    title: i.t,
    dimension: i.dimension,
    action: i.action,
    detail: i.rec,
    monthlyLoss: i.loss,
    severity: i.sev,
  }))

  // Identify non-bottleneck dimensions for brief coverage
  const bottleneck = ctx.bottleneck as string
  const dimOrder = ['Dispatch', 'Fleet', 'Logistics', 'Quality', 'Production'].filter(d => d !== bottleneck)

  return `${RULES}

You are writing the Operational Diagnosis section of a Plant Intelligence Report for ${ctx.plant} in ${ctx.country}.

SCORES:
Production: ${scores?.prod ?? '—'}/100
Dispatch: ${scores?.dispatch ?? '—'}/100
Fleet: ${scores?.logistics ?? '—'}/100
Quality: ${scores?.quality ?? '—'}/100
Overall: ${ctx.overall}/100
Primary bottleneck: ${bottleneck}

KEY METRICS:
Utilisation: ${ctx.utilPct}% — target: 85%
Turnaround: ${ctx.turnaround} min — target: ${ctx.targetTA} min
Dispatch time: ${ctx.dispatchMin ?? '—'} min — target: 15 min
Rejection rate: ${ctx.rejectPct ?? '—'}% — target: <3%
Fleet size: ${ctx.trucks} trucks
Bottleneck loss: up to $${ctx.bnLossMonthly}/month ($${ctx.bnDailyLoss}/day)
Total recoverable: up to $${ctx.totalLossMonthly}/month

FINDINGS DATA (use these numbers exactly, do not invent):
${JSON.stringify(findingsJson, null, 2)}

WRITE EXACTLY THREE SECTIONS:

Section 1 — heading "Performance Scores" on its own line
For each of the four dimensions (Production, Dispatch, Fleet, Quality), write:
[Dimension]: [Score]/100
What this means: [One sentence — specific to THIS plant's actual metric. Reference the number. Not a generic definition.]

Then:
Overall: ${ctx.overall}/100
[One sentence on what this means for the plant as a whole.]

Primary constraint: ${bottleneck}
[One sentence on what this constraint is preventing operationally — cause and effect, plain language.]

Section 2 — heading "${bottleneck} — Primary Constraint" on its own line
This is the bottleneck deep dive. Write 3–4 sentences covering:
- What is wrong (the specific metric and how far it is from target)
- Why it limits the system downstream (what cannot happen because of this)
- The financial consequence (use the bnLossMonthly and bnDailyLoss figures above)
Be direct. This is the section the owner will remember.

Section 3 — heading "Findings" on its own line
Write maximum 4 findings ordered by monthly financial impact, highest first.
Use these findings from the data above. Each finding MUST follow this exact format:

Finding: [What is happening as a fact. Use the actual number from the data. Specific to this plant, not generic.]
Benchmark: [What well-run plants achieve — frame as "well-run plants", not "the industry average"]
Gap: [The difference in real units: minutes, percentage points, loads/day, m³/month]
Impact: up to $[X]/month
Action: [One specific, implementable action. No jargon. No software references. Something a plant manager can do this week.]

Other dimensions covered briefly: ${dimOrder.slice(0, 3).join(', ')} — mention each once within the findings where the data supports it, without separate section headings.`
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
- Warm, direct, experienced. The consultant has seen this pattern before.`

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
Rejection rate: ${ctx.rejectPct ?? '—'}% (target: <3%)

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