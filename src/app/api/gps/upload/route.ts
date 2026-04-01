import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const assessmentId = formData.get('assessmentId') as string | null
  const timezone = (formData.get('timezone') as string | null) ?? 'AST'

  if (!file || !assessmentId) {
    return NextResponse.json({ error: 'Missing file or assessmentId' }, { status: 400 })
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return NextResponse.json({ error: 'Only CSV files are supported.' }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 })
  }

  // Max 50MB
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File exceeds 50 MB limit.' }, { status: 400 })
  }

  // Check assessment exists and user has access
  const { data: assessment, error: asmtErr } = await supabase
    .from('assessments')
    .select('id')
    .eq('id', assessmentId)
    .single()

  if (asmtErr || !assessment) {
    return NextResponse.json({ error: 'Assessment not found or access denied' }, { status: 404 })
  }

  // Archive previous uploads for this assessment
  await supabase
    .from('uploaded_gps_files')
    .update({ archived: true })
    .eq('assessment_id', assessmentId)
    .eq('archived', false)

  // Upload to Supabase Storage
  const storagePath = `assessments/${assessmentId}/gps/${Date.now()}_${file.name}`
  const fileBuffer = await file.arrayBuffer()

  const { error: storageErr } = await supabase.storage
    .from('gps-uploads')
    .upload(storagePath, fileBuffer, {
      contentType: 'text/csv',
      upsert: false,
    })

  if (storageErr) {
    console.error('GPS storage upload error:', storageErr)
    return NextResponse.json(
      { error: 'File storage failed. Please try again.' },
      { status: 500 }
    )
  }

  // Create uploaded_gps_files record
  const { data: uploadRecord, error: dbErr } = await supabase
    .from('uploaded_gps_files')
    .insert({
      assessment_id: assessmentId,
      original_filename: file.name,
      timezone_selected: timezone,
      processing_status: 'uploaded',
      storage_path: storagePath,
    })
    .select()
    .single()

  if (dbErr || !uploadRecord) {
    console.error('GPS DB insert error:', dbErr)
    return NextResponse.json({ error: 'Database error. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    uploadId: uploadRecord.id,
    storagePath,
    filename: file.name,
  })
}
