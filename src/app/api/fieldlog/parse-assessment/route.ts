import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const RATE_LIMIT = { maxRequests: 10, windowSeconds: 60 }
const MAX_RETRIES = 3
const BACKOFF_MS = [2000, 4000, 8000]

async function callWithRetry(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await anthropic.messages.create(params)
    } catch (err: unknown) {
      const isRetryable = err instanceof Anthropic.APIError && (err.status === 429 || err.status === 529 || err.status === 503)
      if (isRetryable && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]))
        continue
      }
      throw err
    }
  }
  throw new Error('Exhausted retries')
}

const FIELD_MAP = `Map the data to these exact field IDs and return a JSON object:
{
  "price_m3": number (selling price per cubic meter in USD),
  "material_cost": number (total material cost per m3 in USD — cement + aggregates + admixtures combined),
  "plant_cap": number (plant capacity in m3 per hour),
  "op_hours": number (operating hours per day),
  "op_days": number (operating days per year),
  "actual_prod": number (actual production last month in m3),
  "n_trucks": number (number of trucks),
  "trips_last_month": number (total truck trips last month — NOT daily, this is the monthly total),
  "turnaround": number or string. If the document contains a specific number (e.g. 104 minutes), return it as a plain number string like "104". Only use dropdown values if no specific number is given: "Under 80 minutes, benchmark performance" | "80 to 100 minutes, acceptable" | "100 to 125 minutes, slow" | "Over 125 minutes, critical bottleneck",
  "reject_pct": number (rejection rate as percentage),
  "delivery_radius_raw": string (the raw delivery radius text from the document, e.g. "10-20 km" or "under 10"),
  "dispatch_tool": string (free text describing dispatch method, e.g. "WhatsApp and paper tickets" or "Dedicated dispatch software"),
  "prod_data_source": string (free text describing where the numbers came from, e.g. "Batch computer system" or "Manual records and estimates"),
  "biggest_pain": string (free text, plant manager's stated challenge),
  "demand_sufficient": string (free text: the answer to "Are you currently able to take all orders that come in, or are there periods where demand outpaces what you can deliver?" Copy their exact words),
  "plant_idle": string (free text: the answer to "Do you experience both queuing AND idle periods on the same day?" Copy their exact words including any Yes/No and explanation),
  "dispatch_peak": string (free text: the answer to "When during the day is the majority of your output dispatched?" Copy their exact words)
}

For dropdown fields: pick the closest matching option. If the value is a number (e.g. turnaround = 115), map it to the correct range.
For numeric fields: extract the number only, no units.
Use null for any field not found in the document.
Return ONLY valid JSON, no explanation.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
  const spend = checkSpendCap(user.id)
  if (!spend.allowed) return NextResponse.json({ error: 'Daily AI budget reached.' }, { status: 429 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!['jpg', 'jpeg', 'png', 'pdf', 'csv', 'xlsx', 'xls'].includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 })
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  try {
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    const isImage = ['jpg', 'jpeg', 'png'].includes(ext)
    const isPdf = ext === 'pdf'

    let parsed: Record<string, unknown> = {}

    if (isImage || isPdf) {
      const contentBlock = isPdf
        ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
        : { type: 'image' as const, source: { type: 'base64' as const, media_type: (ext === 'png' ? 'image/png' : 'image/jpeg') as 'image/png' | 'image/jpeg', data: base64 } }

      const response = await callWithRetry({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: `Extract pre-assessment data from this document.\n\n${FIELD_MAP}` },
          ],
        }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])

    } else if (ext === 'csv') {
      // CSV: read as text and send to Claude
      const text = await file.text()
      const preview = text.slice(0, 8000)

      const response = await callWithRetry({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Extract pre-assessment data from this CSV content:\n\n${preview}\n\n${FIELD_MAP}`,
        }],
      })

      const respText = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const jsonMatch = respText.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } else {
      // Excel (.xlsx/.xls): parse with xlsx library, extract only Q#, Question, Answer columns
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      // Convert to JSON rows to strip the long "Data Definition" column (E) that causes truncation
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
      const essentialCsv = rows.map((row: unknown[]) => {
        // Keep columns A (Q#), B (Question), C (Answer), D (Unit) — skip E (instructions)
        return [row[0] ?? '', row[1] ?? '', row[2] ?? '', row[3] ?? ''].join(' | ')
      }).join('\n')
      const preview = essentialCsv.slice(0, 8000)

      const response = await callWithRetry({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Extract pre-assessment data from this spreadsheet content:\n\n${preview}\n\n${FIELD_MAP}`,
        }],
      })

      const respText = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const jsonMatch = respText.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    }

    trackSpend(user.id)

    // ── Post-parse conversions ──

    // FIX 1: Convert trips_last_month (monthly total) to deliveries_day
    const tripsMonth = +(parsed.trips_last_month ?? 0)
    const opDays = +(parsed.op_days ?? 0)
    if (tripsMonth > 0 && opDays > 0) {
      const workingDaysMonth = Math.round(opDays / 12)
      parsed.deliveries_day = Math.round(tripsMonth / workingDaysMonth * 10) / 10
    }
    delete parsed.trips_last_month

    // FIX 2: Map delivery_radius_raw to midpoint km + platform dropdown
    const radiusRaw = String(parsed.delivery_radius_raw || '').toLowerCase()
    if (radiusRaw) {
      let midpoint = 0
      let dropdown = ''
      if (/under\s*5|less than\s*5|<\s*5/.test(radiusRaw)) {
        midpoint = 4; dropdown = 'Most deliveries under 5 km, dense urban core'
      } else if (/5\s*[-–to]+\s*12|5\s*to\s*12/.test(radiusRaw)) {
        midpoint = 8; dropdown = 'Most deliveries 5 to 12 km, city radius'
      } else if (/12\s*[-–to]+\s*20|12\s*to\s*20/.test(radiusRaw)) {
        midpoint = 16; dropdown = 'Most deliveries 12 to 20 km, suburban / outer city'
      } else if (/under\s*10|less than\s*10|<\s*10/.test(radiusRaw)) {
        midpoint = 7; dropdown = 'Most deliveries 5 to 12 km, city radius'
      } else if (/10\s*[-–to]+\s*20|10\s*to\s*20|10-20/.test(radiusRaw)) {
        midpoint = 15; dropdown = 'Most deliveries 12 to 20 km, suburban / outer city'
      } else if (/over\s*20|more than\s*20|>\s*20|above\s*20/.test(radiusRaw)) {
        midpoint = 25; dropdown = 'Many deliveries over 20 km, regional'
      }
      if (midpoint > 0) {
        parsed.delivery_distance_km = midpoint
        parsed.delivery_radius = dropdown
      }
    }
    // Preserve raw radius for parseRadius() in reportCalculations (never loses precision)
    parsed.delivery_radius_raw = parsed.delivery_radius_raw || parsed.delivery_radius

    // Convert all values to strings (assessment answers are stored as strings)
    const answers: Record<string, string> = {}
    for (const [key, val] of Object.entries(parsed)) {
      if (val != null) {
        answers[key] = String(val)
      }
    }

    // Validation warnings
    const warnings: string[] = []
    const n = (k: string) => parseFloat(answers[k] || '0') || 0

    if (n('price_m3') > 0 && n('cement_cost') > 0 && n('price_m3') < n('cement_cost'))
      warnings.push('Selling price is lower than cement cost')
    if (n('plant_cap') > 200)
      warnings.push(`Plant capacity ${answers.plant_cap} m3/hr seems very high`)
    if (n('op_hours') > 20)
      warnings.push(`Operating hours ${answers.op_hours} hr/day seems very high`)
    if (n('n_trucks') > 50)
      warnings.push(`${answers.n_trucks} trucks is unusually large`)
    if (n('reject_pct') > 10)
      warnings.push(`Rejection rate ${answers.reject_pct}% is very high`)
    if (n('actual_prod') > 0 && n('actual_prod') < 100)
      warnings.push(`Production ${answers.actual_prod} m3/month seems very low`)

    return NextResponse.json({ answers, warnings, fieldsFound: Object.keys(answers).length })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Parse failed'
    const isOverloaded = msg.includes('overloaded') || msg.includes('Overloaded') || msg.includes('529')
    return NextResponse.json({
      error: isOverloaded
        ? 'AI service is temporarily busy. Please try again in a few minutes.'
        : msg
    }, { status: isOverloaded ? 503 : 500 })
  }
}
