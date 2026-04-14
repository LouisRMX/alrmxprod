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
  "deliveries_day": number (deliveries per working day),
  "turnaround": number or string. If the document contains a specific number (e.g. 104 minutes), return it as a plain number string like "104". Only use dropdown values if no specific number is given: "Under 80 minutes, benchmark performance" | "80 to 100 minutes, acceptable" | "100 to 125 minutes, slow" | "Over 125 minutes, critical bottleneck",
  "reject_pct": number (rejection rate as percentage),
  "delivery_distance_km": number (average delivery distance in km if a specific number is given, e.g. 15),
  "delivery_radius": string (must be EXACTLY one of: "Most deliveries under 5 km, dense urban core" | "Most deliveries 5 to 12 km, city radius" | "Most deliveries 12 to 20 km, suburban / outer city" | "Many deliveries over 20 km, regional"),
  "dispatch_tool": string (must be EXACTLY one of: "Dedicated dispatch software with GPS tracking" | "Spreadsheet combined with WhatsApp" | "WhatsApp messages only, no spreadsheet" | "Phone calls and whiteboard only"),
  "order_to_dispatch": string (must be EXACTLY one of: "Under 15 minutes, fast response" | "15 to 25 minutes, acceptable" | "25 to 40 minutes, slow" | "Over 40 minutes, critical delay"),
  "prod_data_source": string (must be EXACTLY one of: "System records, read from batch computer or dispatch system" | "Calculated from monthly reports or delivery tickets" | "Estimated by the plant manager from memory" | "Rough estimate, low confidence"),
  "biggest_pain": string (free text, plant manager's stated challenge),
  "demand_sufficient": string (must be EXACTLY one of: "Operations, we have more demand than we can currently produce or deliver" | "Both, we could sell more, and operations are also holding us back" | "Demand, our volume reflects available orders, not operational limits" | "Not sure")
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
      const preview = text.slice(0, 5000)

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
      // Excel (.xlsx/.xls): parse with xlsx library, convert to text, send to Claude
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const csvText = XLSX.utils.sheet_to_csv(sheet)
      const preview = csvText.slice(0, 5000)

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

    // Convert all numeric values to strings (assessment answers are stored as strings)
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
