import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend, ESTIMATED_COST_PER_CALL } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

const RATE_LIMIT = { maxRequests: 10, windowSeconds: 60 }

const PARSE_PROMPT = `You are parsing a transcribed field observation from a ready-mix concrete plant.
Extract any truck trip data that maps to these fields:
- Truck ID or number (truck_id)
- Driver name (driver_name)
- Delivery site name (site_name)
- Departure time loaded from plant (departure_loaded, ISO 8601)
- Arrival time at site (arrival_site, ISO 8601)
- Return time to plant (arrival_plant, ISO 8601)
- Load volume in cubic meters (load_m3, number)
- Rejection (rejected: true/false)
- Rejection cause (reject_cause, text)
- Any other observations (notes, text)

Return ONLY a JSON array of trips. Use null for any field not found.
Use ISO 8601 for timestamps. If only times are mentioned (not full timestamps), use the provided log_date.
Return valid JSON only, no explanation.`

export async function POST(req: NextRequest) {
  // Feature flag: Whisper requires OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Audio transcription not configured. OPENAI_API_KEY required.' }, { status: 501 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
  const spend = checkSpendCap(user.id)
  if (!spend.allowed) return NextResponse.json({ error: 'Daily AI budget reached.' }, { status: 429 })

  const formData = await req.formData()
  const audioFile = formData.get('audio') as File | null
  const assessmentId = formData.get('assessmentId') as string
  const logDate = formData.get('logDate') as string
  const mode = (formData.get('mode') as string) || 'structured'

  if (!audioFile || !assessmentId) {
    return NextResponse.json({ error: 'Missing audio file or assessmentId' }, { status: 400 })
  }

  // Upload audio to storage
  const ext = audioFile.name.split('.').pop() || 'webm'
  const storagePath = `daily-log-uploads/${assessmentId}/audio/${Date.now()}_recording.${ext}`
  const fileBuffer = await audioFile.arrayBuffer()

  const { error: storageErr } = await supabase.storage
    .from('daily-log-uploads')
    .upload(storagePath, fileBuffer, { contentType: audioFile.type })

  if (storageErr) {
    return NextResponse.json({ error: `Storage upload failed: ${storageErr.message}` }, { status: 500 })
  }

  // Create upload record
  const { data: upload, error: dbErr } = await supabase
    .from('daily_log_uploads')
    .insert({
      assessment_id: assessmentId,
      uploaded_by: user.id,
      file_type: 'audio',
      original_filename: audioFile.name,
      storage_path: storagePath,
      processing_status: 'processing',
      log_date: logDate || null,
    })
    .select('id')
    .single()

  if (dbErr) {
    return NextResponse.json({ error: `Database insert failed: ${dbErr.message}` }, { status: 500 })
  }

  try {
    // Step 1: Whisper transcription
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Convert File to the format Whisper expects
    const whisperFile = new File([fileBuffer], audioFile.name, { type: audioFile.type })
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: whisperFile,
      response_format: 'json',
    })

    const rawTranscript = transcription.text
    await supabase.from('daily_log_uploads').update({ raw_transcription: rawTranscript }).eq('id', upload.id)

    // Step 2: Detect language and translate if needed
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    // Quick language detection via Claude Haiku
    const langResp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: `What is the ISO 639-1 language code of this text? Return ONLY the 2-letter code, nothing else.\n\n${rawTranscript.slice(0, 500)}` }],
    })
    const detectedLang = langResp.content[0].type === 'text' ? langResp.content[0].text.trim().toLowerCase().slice(0, 2) : 'en'

    let workingText = rawTranscript
    let translatedText: string | null = null

    if (detectedLang !== 'en') {
      // Translate to English, preserving numbers and truck IDs
      const transResp = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Translate the following text to English. Preserve all numbers, truck IDs, times, and names exactly as they appear. Do not add commentary.\n\n${rawTranscript}`,
        }],
      })
      translatedText = transResp.content[0].type === 'text' ? transResp.content[0].text : rawTranscript
      workingText = translatedText
      await supabase.from('daily_log_uploads').update({ translated_text: translatedText }).eq('id', upload.id)
    }

    // Step 3: Parse (structured mode) or return transcript (interview mode)
    if (mode === 'interview') {
      await supabase.from('daily_log_uploads').update({ processing_status: 'parsed' }).eq('id', upload.id)
      trackSpend(user.id, ESTIMATED_COST_PER_CALL * 2)

      return NextResponse.json({
        uploadId: upload.id,
        mode: 'interview',
        transcription: rawTranscript,
        translation: translatedText,
        language: detectedLang,
      })
    }

    // Structured mode: parse into trip rows
    const parseResp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `${PARSE_PROMPT}\n\nThe log_date is: ${logDate || new Date().toISOString().slice(0, 10)}\n\nTranscript:\n${workingText}`,
      }],
    })

    const parseText = parseResp.content[0].type === 'text' ? parseResp.content[0].text : '[]'
    const jsonMatch = parseText.match(/\[[\s\S]*\]/)
    const parsedRows = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    await supabase.from('daily_log_uploads').update({
      processing_status: 'parsed',
      parsed_data: parsedRows,
      row_count: parsedRows.length,
    }).eq('id', upload.id)

    trackSpend(user.id, ESTIMATED_COST_PER_CALL * 2)

    return NextResponse.json({
      uploadId: upload.id,
      mode: 'structured',
      rows: parsedRows,
      transcription: rawTranscript,
      translation: translatedText,
      language: detectedLang,
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Transcription failed'
    await supabase.from('daily_log_uploads').update({
      processing_status: 'failed',
      error_log: { error: msg, timestamp: new Date().toISOString() },
    }).eq('id', upload.id)

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
