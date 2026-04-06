import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend, ESTIMATED_COST_HAIKU } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const RATE_LIMIT = { maxRequests: 30, windowSeconds: 60 }

// Build a rich, plant-specific context string from calcResult + answers.
// Only include lines with real values — no undefined/NaN/null.
function buildPlantContext(calcResult: Record<string, unknown>, answers: Record<string, string>, financialBottleneck?: string | null): string {
  const numbers: string[] = []
  const qualitative: string[] = []

  const scores = calcResult.scores as Record<string, number> | undefined

  // Bottleneck
  const primaryBottleneck = financialBottleneck || calcResult.bottleneck
  if (primaryBottleneck) numbers.push(`Primary bottleneck: ${primaryBottleneck}`)
  if (financialBottleneck && calcResult.bottleneck && financialBottleneck !== calcResult.bottleneck) {
    numbers.push(`Note: ${calcResult.bottleneck} has the lowest score but ${financialBottleneck} drives the highest financial loss`)
  }

  // Scores
  if (calcResult.overall != null) numbers.push(`Overall score: ${Math.round(calcResult.overall as number)}/100`)
  if (scores?.dispatch != null) numbers.push(`Dispatch score: ${Math.round(scores.dispatch)}/100`)
  if (scores?.logistics != null) numbers.push(`Fleet/Logistics score: ${Math.round(scores.logistics)}/100`)
  if (scores?.quality != null) numbers.push(`Quality score: ${Math.round(scores.quality)}/100`)
  if (scores?.prod != null) numbers.push(`Production score: ${Math.round(scores.prod)}/100`)

  // Fleet numbers
  if (calcResult.trucks) numbers.push(`Trucks: ${calcResult.trucks}`)
  if (calcResult.delDay) numbers.push(`Deliveries per day: ${Math.round(calcResult.delDay as number)}`)
  if (calcResult.util != null) numbers.push(`Fleet utilisation: ${Math.round((calcResult.util as number) * 100)}%`)
  if (calcResult.radius) numbers.push(`Delivery radius: ${calcResult.radius} km`)

  // Dispatch numbers
  if (calcResult.dispatchMin != null) numbers.push(`Order-to-dispatch: ${calcResult.dispatchMin} min (target: 15 min)`)

  // Turnaround numbers
  if (calcResult.ta) {
    const ta = Math.round(calcResult.ta as number)
    const targetTA = calcResult.TARGET_TA as number
    const excess = calcResult.excessMin as number
    numbers.push(`Turnaround: ${ta} min (target: ${targetTA} min${excess > 0 ? `, ${excess} min excess` : ''})`)
  }
  if (calcResult.siteWait && (calcResult.siteWait as number) > 0) {
    const sw = Math.round(calcResult.siteWait as number)
    numbers.push(`Site wait: ~${sw} min (benchmark: 35 min${sw > 35 ? `, ${sw - 35} min excess` : ''})`)
  }
  if (calcResult.washoutMin && (calcResult.washoutMin as number) > 0) {
    const wm = Math.round(calcResult.washoutMin as number)
    numbers.push(`Washout time: ~${wm} min (benchmark: 12 min${wm > 12 ? `, ${wm - 12} min excess` : ''})`)
  }

  // Quality numbers
  if (calcResult.rejectPct != null) {
    numbers.push(`Reject rate: ${(calcResult.rejectPct as number).toFixed(1)}% (target: <3%)`)
  }
  if (calcResult.rejectPlantFraction != null && (calcResult.rejectPct as number) > 0) {
    const pf = Math.round((calcResult.rejectPlantFraction as number) * 100)
    numbers.push(`Plant-side rejections: ~${pf}% ($${Math.round((calcResult.rejectPlantSideLoss as number) / 1000)}k/month)`)
    numbers.push(`Customer-side rejections: ~${100 - pf}% ($${Math.round((calcResult.rejectCustomerSideLoss as number) / 1000)}k/month)`)
  }

  // Demand + financial
  if (calcResult.demandSufficient === false) numbers.push(`Demand context: demand-limited — not enough orders to fill capacity`)
  if (calcResult.demandSufficient === true) numbers.push(`Demand context: operations-limited — demand is sufficient, throughput is the constraint`)
  if (calcResult.hiddenRevMonthly) {
    numbers.push(`Monthly revenue recoverable: $${Math.round((calcResult.hiddenRevMonthly as number) / 1000)}k`)
  }

  // Qualitative — named tools, causes, practices
  if (answers.dispatch_tool) qualitative.push(`Dispatch tool in use: "${answers.dispatch_tool}"`)
  if (answers.route_clustering) qualitative.push(`Route clustering: "${answers.route_clustering}"`)
  if (answers.plant_idle) qualitative.push(`Plant idle time pattern: "${answers.plant_idle}"`)
  if (answers.site_wait_reason) qualitative.push(`Named cause of site wait: "${answers.site_wait_reason}"`)
  if (answers.reject_reason) qualitative.push(`Named cause of rejections: "${answers.reject_reason}"`)
  if (answers.slump_test) qualitative.push(`Slump test practice: "${answers.slump_test}"`)
  if (answers.calibration) qualitative.push(`Calibration practice: "${answers.calibration}"`)
  if (answers.order_to_dispatch) qualitative.push(`Order-to-dispatch (self-reported): "${answers.order_to_dispatch}"`)

  const clean = (lines: string[]) =>
    lines.filter(l => !l.includes('undefined') && !l.includes('NaN') && !l.match(/:\s*null/))

  const parts: string[] = []
  const cleanNums = clean(numbers)
  const cleanQual = clean(qualitative)
  if (cleanNums.length) parts.push(`NUMBERS:\n${cleanNums.join('\n')}`)
  if (cleanQual.length) parts.push(`OPERATIONS CONTEXT (named tools, causes, practices — use these exact names in relevant steps):\n${cleanQual.join('\n')}`)
  return parts.join('\n\n')
}

function buildPrompt(action: string, plantContext: string): string {
  return `You are a senior operations advisor for ready-mix concrete plants. You work with plant managers who have no patience for generic advice.

Generate exactly 5 action steps for a plant manager to implement this specific task:

TASK: "${action}"

PLANT DATA — do not invent data, use only what is below:
${plantContext}

RULES — strictly enforced:
1. Every step must reference at least one specific number from NUMBERS (minutes, trucks, %, deliveries/day, or $).
2. If OPERATIONS CONTEXT lists a named tool, cause, or practice, that exact name MUST appear in the step that addresses it. Example: if dispatch tool is "WhatsApp groups", write "Replace WhatsApp group dispatch with…" not "use a better system".
3. Steps are chronological — step 1 is done before step 2.
4. Steps are executable in the next 2 weeks — no long-term projects.
5. Banned words and phrases: "implement best practices", "train staff", "set up a process", "monitor performance", "consider", "review", "improve", "optimize", "ensure", "leverage".
6. Each step: maximum 18 words.
7. If a step could apply to any plant in the world, it is too generic — rewrite it.
8. Final step must be a measurable verification with a specific target number from the plant data.

GOOD example (site_wait_reason = "Pump crew not ready on arrival"):
"Call pump crew 30 min before truck departure — target site wait under 35 min"

BAD example of the same step:
"Ensure site is ready before trucks depart" (no named cause, no number)

Return ONLY valid JSON. No markdown fences, no explanation, no other text.
Format: [{"text": "Step text here", "done": false}, ...]`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before making more requests.' },
      { status: 429 }
    )
  }

  const spend = checkSpendCap(user.id)
  if (!spend.allowed) {
    return NextResponse.json(
      { error: `Daily AI budget reached ($${spend.dailyCap}/day). Resets in 24 hours.` },
      { status: 429 }
    )
  }

  const { action, calcResult, answers, financialBottleneck } = await req.json()
  if (!action || !calcResult) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const plantContext = buildPlantContext(calcResult, answers ?? {}, financialBottleneck)
  const prompt = buildPrompt(action, plantContext)

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    trackSpend(user.id, ESTIMATED_COST_HAIKU)

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'

    // Strip markdown fences if model added them despite instructions
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let checklist: { text: string; done: boolean }[]
    try {
      checklist = JSON.parse(cleaned)
      // Ensure each item has an id
      checklist = checklist.map((item, i) => ({
        id: `ci-${Date.now()}-${i}`,
        text: item.text,
        done: item.done ?? false,
      }))
    } catch {
      return NextResponse.json({ error: 'Failed to parse checklist JSON' }, { status: 500 })
    }

    return NextResponse.json(checklist)
  } catch (err) {
    console.error('generate-checklist error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
