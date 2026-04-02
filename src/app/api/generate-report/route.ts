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
      executive: `This plant is leaving an estimated $3,231 on the table every working day.

Al-Noor RMX operates 10 trucks out of a 34 m³/hr plant on a 10 km delivery radius. The fleet is doing the work of 8 — two trucks are regularly off-road — and the 95-minute turnaround is 20 minutes above what the radius and shift length require. Afternoons are where the losses accumulate: trucks that should be on their fourth cycle are still on their third.

What This Is Costing
Cost of inaction: $80,787/month
Turnaround excess (17 min above 78-min target): $46,200/month
Rejection losses (3.8% rate, plant absorbs 100%): $18,400/month
Partial loads (6.5 m³ on 7 m³ trucks): $9,100/month
Truck breakdowns (3 last month, reactive maintenance): $7,100/month

Annual equivalent: $969,000/year — roughly the cost of two additional trucks, recurring every year without a capital decision.

Hidden revenue: $52,000/month
At a 78-minute turnaround, the existing 8-operative fleet can support 54 deliveries per day versus 42 today. That gap — 12 deliveries — represents $52,000/month in contribution that requires no new trucks, no new customers, and no capital. It requires a site readiness protocol and a dispatcher with a target.`,

      diagnosis: `Performance Scores
Production: 82/100
What this means: The plant is producing 6,400 m³/month at 89% of rated capacity — close to the 85% best-practice target, but this figure is misleading. Utilisation appears healthy because the constraint is downstream in the fleet, not at the batch plant.

Dispatch: 52/100
What this means: Order-to-dispatch averaging 32 minutes against a 15-minute target is the largest controllable gap in the operation. No zone system, no pre-loading protocol, no real-time tracking. The dispatcher is reacting to orders rather than anticipating them.

Fleet: 61/100
What this means: A 95-minute turnaround on a 10 km radius costs the plant 17 minutes per cycle that it should not be spending. Two trucks off-road on any given day reduce effective fleet size by 20%. Three breakdowns last month on an informally maintained fleet.

Quality: 71/100
What this means: A 3.8% rejection rate is 0.8 percentage points above the 3% benchmark. At $36/m³ in raw materials and 100% plant liability, each returned load is a write-off. The cause — heat stiffening during transit — is expected but only partially mitigated.

Overall: 67/100
The plant has the infrastructure to perform significantly above its current level. The constraint is operational rhythm, not capacity.

Primary constraint: Fleet
The turnaround bottleneck is preventing the batch plant from converting available capacity into deliveries. Fixing dispatch and site coordination recovers this without capital.

Findings
Finding: Truck turnaround 95 min against a 78-min target for this delivery radius — 17 minutes of avoidable idle time per cycle.
Benchmark: Well-run plants on a 10 km radius achieve 75–82 min round trips.
Gap: 17 min excess × 54 target deliveries × 22 operating days = 20,196 lost truck-minutes per month.
Impact: $46,200/month
Action: Require site readiness confirmation before dispatch. No truck leaves until the pump crew and foreman have confirmed ready — via WhatsApp message, logged by dispatcher.

Finding: Order-to-dispatch 32 minutes against a 15-minute target — longest controllable gap in the dispatch chain.
Benchmark: Well-run plants dispatch within 10–15 minutes of order confirmation.
Gap: 17 min excess per order × 42 deliveries/day × 22 days = 15,708 excess dispatch-minutes per month.
Impact: $16,100/month (included in fleet bottleneck estimate)
Action: Pre-load 3 trucks before the morning peak. Assign one dispatcher whose sole metric is order-to-dispatch time, tracked daily.

Finding: 3.8% rejection rate with plant absorbing 100% of material costs — no contractor liability.
Benchmark: Well-run plants hold rejections below 3%, with shared liability clauses standard in GCC contracts.
Gap: 0.8 percentage points above benchmark × 42 deliveries × 7 m³ × $36 material cost.
Impact: $18,400/month
Action: Enforce retarder dosage protocol on all loads with transit time over 40 minutes. Add a material cost recovery clause to all contract renewals.

Finding: Average load 6.5 m³ on 7 m³ trucks — 7% of mixer capacity unused per trip.
Benchmark: Well-run plants achieve average loads above 6.8 m³ through minimum order policies or small-load surcharges.
Gap: 0.5 m³ × 42 deliveries/day × 22 days = 462 m³/month unbilled.
Impact: $9,100/month
Action: Introduce a minimum batch size of 6.8 m³ or a surcharge below that threshold. Implement in next contract renewal cycle.`,

      actions: `The pattern here is consistent: this plant has the fleet, the capacity, and the demand to perform at a significantly higher level — but the daily operating rhythm is working against it at three points simultaneously: trucks leave before sites are ready, orders are dispatched 17 minutes later than necessary, and rejected loads are written off with no recovery mechanism.

Next Step
This pre-assessment has established the financial picture based on what Al-Noor reports about itself: a potential $80,000/month in recoverable margin, concentrated in fleet turnaround and dispatch.

What it cannot tell us is where in the 95-minute turnaround time is actually being lost — whether the 32-minute dispatch figure reflects a consistent pattern or a busy-day average, and whether the rejection cause is primarily a dosing issue at the plant or a site-readiness issue at the customer end.

An on-site visit answers those three questions in half a day and produces a findings report the plant owner can act on the same week.`,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const issues = ctx.issues as any[]
  const issueLines = issues
    .filter(i => i.loss > 0)
    .map(i => `- ${i.t}: $${i.loss.toLocaleString()}/month`)
    .join('\n')

  if (ctx.performingWell) {
    return `IMPORTANT: Write in plain text only. No markdown, no asterisks, no headings with #, no bullet dashes.

You are writing the Executive Summary of a Plant Intelligence Report for a well-performing ready-mix concrete plant. The assessment found no significant operational losses. This report confirms strong performance and identifies incremental opportunities.

PLANT DATA:
Plant: ${ctx.plant}, ${ctx.country}
Assessment date: ${ctx.date}
Overall score: ${ctx.overall}/100
Utilisation: ${ctx.utilPct}% (best-practice target: 85%)
Truck turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)
Hidden revenue headroom: $${ctx.hiddenRevMonthly}/month (if demand supports it)

WRITE THREE THINGS IN ORDER — no headings, no labels:

1. OPENING — one sentence acknowledging the strong operational position. Be specific to the actual scores and metrics, not generic praise.

2. PLANT SNAPSHOT — 2 to 3 sentences. What is this plant doing well and why? What in the data supports this conclusion? Be precise — reference actual numbers.

3. WHAT TO WATCH — heading on its own line: "What To Watch"
Even well-run plants have incremental opportunities. Identify 2–3 areas worth monitoring or improving, based on the scores and metrics above. If hidden revenue headroom exists, note it and what it would require to capture.

RULES:
- Short sentences. One idea per sentence.
- Do not invent problems that aren't in the data.
- Do not use: optimize, leverage, streamline, robust, synergy, utilize, actionable.`
  }

  return `IMPORTANT: Write in plain text only. Do not use markdown. No asterisks, no bold (**text**), no italic (*text*), no headings with #, no bullet dashes (- item). Use plain sentences and blank lines between sections.

IMPORTANT: All financial figures (monthly losses, revenue opportunities, annual equivalents) are POTENTIAL figures — they are contingent on the plant having sufficient customer demand to absorb recovered capacity. Always frame dollar amounts as potential or recoverable, not as guaranteed losses. Example: "a potential $X/month" or "up to $X/month could be recovered" — never "the plant is losing $X".

You are writing the Executive Summary section of a Plant Intelligence Report for a ready-mix concrete plant. This report will be reviewed by an operations consultant before being sent to the plant owner — a family business owner who manages daily operations personally and makes decisions based on trust and clear financial consequence.

PLANT DATA:
Plant: ${ctx.plant}, ${ctx.country}
Assessment date: ${ctx.date}
Cost of inaction: $${ctx.totalLossMonthly}/month (= $${ctx.dailyLoss} every working day)
Hidden revenue opportunity: $${ctx.hiddenRevMonthly}/month
Primary constraint: ${ctx.bottleneck}
Utilisation: ${ctx.utilPct}% (best-practice target: 85%)
Truck turnaround: ${ctx.turnaround} min (target: ${ctx.targetTA} min)

COST BREAKDOWN (use these figures — do not invent):
${issueLines}

WRITE EXACTLY THREE THINGS IN THIS ORDER — no headings, no labels:

1. OPENING HOOK — one sentence:
State the daily financial exposure as a plain fact. Formula: $${ctx.dailyLoss} per working day. Example format: "This plant is leaving an estimated $[X] on the table every working day." Use the actual figure. Do not round dramatically.

2. PLANT SNAPSHOT — 2 to 3 sentences:
Describe the plant's overall situation in plain language. No scores. No dollar figures yet. Write as a senior operations consultant summarising what he found to the owner, directly. Lead with the single most important observation. Be specific to this plant's numbers. No reassurance, no padding.

3. WHAT THIS IS COSTING — start with this exact heading on its own line: "What This Is Costing"
Then write: "Cost of inaction: $${ctx.totalLossMonthly}/month"
List each contributing gap on a new line with its individual cost (use the breakdown above).
Then one sentence: the annual equivalent and what that represents in plain business terms.
Blank line, then: "Hidden revenue: $${ctx.hiddenRevMonthly}/month"
One sentence: what can realistically be recovered within 6 months by fixing dispatch and quality alone, without adding trucks or capital. One sentence: annual equivalent.

RULES:
- Every number must be followed by a sentence that explains what it means for this specific plant.
- Do not use: optimize, leverage, streamline, robust, synergy, utilize, actionable, deep dive, or any variant.
- Do not say "our analysis shows" or "the data indicates" — just state the finding.
- Never invent data. Use only the figures provided above.
- Short sentences. One idea per sentence.`
}

function buildDiagnosisPrompt(ctx: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scores = ctx.scores as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const issues = ctx.issues as any[]

  if (ctx.performingWell) {
    return `IMPORTANT: Write in plain text only. No markdown, no asterisks, no headings with #, no bullet dashes.

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

WRITE TWO THINGS:

1. PERFORMANCE SCORES — heading on its own line: "Performance Scores"
For each dimension write:
[Dimension]: [Score]/100
What this means: [One sentence specific to what this score says about this plant's operations.]

Overall: ${ctx.overall}/100
[One sentence on what this overall score means.]

2. WHAT IS WORKING — heading on its own line: "What Is Working"
3 to 4 sentences describing the operational strengths this data reveals. Be specific. Reference actual numbers. Identify anything that could slip if not actively maintained.

RULES:
- Do not invent problems. Only note genuine observations from the data.
- Short sentences. One idea per sentence.
- Do not use: optimize, leverage, streamline, robust, synergy, utilize, actionable.`
  }

  const topIssues = issues
    .filter(i => i.loss > 0)
    .slice(0, 4)

  const findingsJson = topIssues.map(i => ({
    title: i.t,
    action: i.action,
    detail: i.rec,
    monthlyLoss: i.loss,
    severity: i.sev,
    type: i.category,
  }))

  return `IMPORTANT: Write in plain text only. Do not use markdown. No asterisks, no bold (**text**), no italic (*text*), no headings with #, no bullet dashes (- item). Use plain sentences and blank lines between sections.

IMPORTANT: All financial figures are POTENTIAL — contingent on sufficient customer demand to fill recovered capacity. Frame them as "potential", "recoverable", or "up to X" — never as confirmed losses.

You are writing the Operational Diagnosis section of a Plant Intelligence Report for ${ctx.plant} in ${ctx.country}.

SCORES:
Production: ${scores?.prod ?? '—'}/100
Dispatch: ${scores?.dispatch ?? '—'}/100
Fleet: ${scores?.logistics ?? '—'}/100
Quality: ${scores?.quality ?? '—'}/100
Overall: ${ctx.overall}/100
Primary bottleneck: ${ctx.bottleneck}

KEY METRICS:
Current utilisation: ${ctx.utilPct}% — best-practice target: 85%
Truck turnaround: ${ctx.turnaround} min — target: ${ctx.targetTA} min
Fleet size: ${ctx.trucks} trucks

FINDINGS DATA — use these exact numbers, do not invent:
${JSON.stringify(findingsJson, null, 2)}

BEST-PRACTICE BENCHMARKS (international, NRMCA-sourced — frame as "well-run plants" not "GCC average"):
- Plant utilisation: 85% of installed capacity
- Fleet throughput: 3,800+ m³ per truck per year
- Returned / rejected concrete: below 3% of production
- Batch consistency: 90%+ of loads within specification

WRITE EXACTLY TWO THINGS:

1. PERFORMANCE SCORES — heading on its own line: "Performance Scores"
For each of the four dimensions write this exact format:
[Dimension]: [Score]/100
What this means: [One sentence — what does this score say about THIS plant's operations? Reference the actual metric where possible. Not a generic definition.]

Then write:
Overall: ${ctx.overall}/100
[One sentence on what this overall score means for the plant as a whole.]

Primary constraint: ${ctx.bottleneck}
[One sentence on what this constraint is preventing — in plain operational terms, not abstract.]

2. FINDINGS — heading on its own line: "Findings"
Write maximum 4 findings from the data above. Order by monthly financial impact, highest first.
Each finding MUST use this exact format:

Finding: [State what is happening as a fact. Use the actual numbers from the data — e.g. if turnaround is 108 min and target is 80 min, say so. Make it concrete and specific to this plant, not generic.]
Benchmark: [What well-run plants of this type achieve — use the benchmarks above where relevant]
Gap: [The difference in real operational units: minutes, percentage points, loads per day, m³/month]
Impact: $[X]/month
Action: [One specific, implementable action. No jargon, no acronyms, no references to software the plant may not have.]

RULES:
- Every score and every number must be followed by what it means operationally.
- Do not use: optimize, leverage, streamline, robust, synergy, utilize, actionable.
- Never invent data. Use only the figures provided.
- Write for a family business owner who is intelligent and has no patience for consultants who talk around things.`
}

function buildActionsPrompt(ctx: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const issues = ctx.issues as any[]

  if (ctx.performingWell) {
    return `IMPORTANT: Write in plain text only. No markdown, no asterisks, no headings with #, no bullet dashes.

You are writing the Next Step section of a Plant Intelligence Report for a well-performing ready-mix concrete plant. No significant losses were found. Your job is to frame what this means and what sensible next steps look like for a plant that is already performing well.

CONTEXT:
Plant: ${ctx.plant}, ${ctx.country}
Overall score: ${ctx.overall}/100
Utilisation: ${ctx.utilPct}% — target: 85%
Turnaround: ${ctx.turnaround} min — target: ${ctx.targetTA} min
Hidden revenue headroom: $${ctx.hiddenRevMonthly}/month

WRITE TWO THINGS:

1. SYNTHESIS — one sentence, no heading:
Name what the data confirms about this operation. What does the absence of major issues tell us? Be specific to the numbers.

2. NEXT STEP — heading on its own line: "Next Step"
Exactly 3 sentences:
Sentence 1: What this assessment has confirmed.
Sentence 2: What an on-site visit would verify or add — not what it would fix, because there is nothing obviously broken.
Sentence 3: A concrete suggestion for maintaining this performance level — could be a monitoring discipline, a periodic review, or a specific area to develop further.

RULES:
- Do not manufacture urgency that does not exist.
- Short sentences. One idea per sentence.
- Do not use: optimize, leverage, streamline, robust, synergy, utilize, actionable.`
  }

  const topFindings = issues
    .filter(i => i.loss > 0)
    .slice(0, 3)
    .map(i => `${i.t} ($${i.loss.toLocaleString()}/month)`)
    .join('; ')

  return `IMPORTANT: Write in plain text only. Do not use markdown. No asterisks, no bold (**text**), no italic (*text*), no headings with #, no bullet dashes (- item). Use plain sentences and blank lines between sections.

IMPORTANT: All financial figures are POTENTIAL — contingent on sufficient customer demand to fill recovered capacity. Frame them as "potential", "recoverable", or "up to X" — never as confirmed losses.

You are writing the final section of a Plant Intelligence Report for ${ctx.plant} in ${ctx.country}. This report is being prepared by an operations consultant who will review it, then present it to the plant owner in a dedicated session before any on-site visit.

CONTEXT:
Primary constraint: ${ctx.bottleneck}
Monthly cost of inaction: $${ctx.totalLossMonthly}
Overall score: ${ctx.overall}/100
Top findings: ${topFindings}

WRITE EXACTLY TWO THINGS:

1. SYNTHESIS — one sentence, no heading, no label:
Name the pattern that connects all the findings. What do they have in common? What does that tell you about the underlying cause — not the individual symptoms? This is the sentence the owner will repeat to his operations manager the next day. It should be specific to this plant's data, not generic.

Good examples of synthesis sentences (do not copy — write one specific to this plant):
- "Taken together, these findings point to a dispatch and site coordination problem — not a capacity problem."
- "The pattern here is consistent: the plant has the infrastructure to perform at a significantly higher level, but the daily operating rhythm is working against it."
- "These gaps share a common thread: decisions that should be data-driven are currently being made by instinct."

2. NEXT STEP — heading on its own line: "Next Step"
Write exactly 3 sentences:
Sentence 1: What the pre-assessment has established — the financial picture, based on what the plant reports about itself.
Sentence 2: What it cannot tell us. Specifically name 2–3 of the following that are most relevant to this plant: actual batching accuracy versus what is logged; how trucks physically move through the plant versus how the process is described; where in the dispatch-to-delivery chain time is genuinely being lost; whether reject causes are plant-side, driver-side, or customer-side; how closely the reported numbers match what happens on a typical day.
Sentence 3: What the logical next step is — framed as an obvious conclusion, not a proposal. The owner should finish reading this thinking "yes, that makes sense" — not "they want to sell me something."

RULES:
- Do not use: propose, recommend, our team, we would like to, sales pitch language of any kind.
- Do not use: optimize, leverage, streamline, robust, synergy, utilize, actionable.
- Warm, direct, experienced. The consultant has seen this pattern before and knows what needs to happen.
- Short sentences. One idea per sentence.
- Maximum length: half a page.`
}