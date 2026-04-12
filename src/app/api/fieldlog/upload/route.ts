import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const assessmentId = formData.get('assessmentId') as string | null
  const logDate = formData.get('logDate') as string | null

  if (!file || !assessmentId) {
    return NextResponse.json({ error: 'Missing file or assessmentId' }, { status: 400 })
  }

  // Validate file type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const allowedExts = ['jpg', 'jpeg', 'png', 'pdf', 'csv', 'xlsx']
  if (!allowedExts.includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 })
  }

  // Validate file size (20MB max)
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  // Determine file_type category
  const fileType = ['jpg', 'jpeg', 'png'].includes(ext) ? 'image'
    : ext === 'pdf' ? 'pdf'
    : ext === 'csv' ? 'csv'
    : 'excel'

  // Upload to Supabase Storage
  const storagePath = `daily-log-uploads/${assessmentId}/${Date.now()}_${file.name}`
  const fileBuffer = await file.arrayBuffer()

  const { error: storageErr } = await supabase.storage
    .from('daily-log-uploads')
    .upload(storagePath, fileBuffer, { contentType: file.type })

  if (storageErr) {
    return NextResponse.json({ error: `Storage upload failed: ${storageErr.message}` }, { status: 500 })
  }

  // Create database record
  const { data: upload, error: dbErr } = await supabase
    .from('daily_log_uploads')
    .insert({
      assessment_id: assessmentId,
      uploaded_by: user.id,
      file_type: fileType,
      original_filename: file.name,
      storage_path: storagePath,
      processing_status: 'uploaded',
      log_date: logDate || null,
    })
    .select('id')
    .single()

  if (dbErr) {
    return NextResponse.json({ error: `Database insert failed: ${dbErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ uploadId: upload.id, storagePath })
}
