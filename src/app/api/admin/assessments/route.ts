import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isSystemAdmin } from '@/lib/supabase/admin'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await isSystemAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    plant_id?: string
    new_plant?: { customer_id: string; name: string; country: string }
    date: string
    season: string
    phase: string
    analyst_id: string
    baseline_id?: string
    is_followup?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = getAdminClient()

  // Create plant if needed
  let plantId = body.plant_id
  if (body.new_plant) {
    const { data: newPlant, error: plantErr } = await admin
      .from('plants')
      .insert({
        customer_id: body.new_plant.customer_id,
        name: body.new_plant.name,
        country: body.new_plant.country,
      })
      .select()
      .single()

    if (plantErr || !newPlant) {
      return NextResponse.json({ error: plantErr?.message || 'Failed to create plant' }, { status: 500 })
    }
    plantId = newPlant.id
  }

  if (!plantId) return NextResponse.json({ error: 'Missing plant_id' }, { status: 400 })

  // Mark baseline as baseline if this is a follow-up
  if (body.is_followup && body.baseline_id) {
    await admin.from('assessments').update({ is_baseline: true }).eq('id', body.baseline_id)
  }

  // Create assessment
  const { data: assessment, error: assessErr } = await admin
    .from('assessments')
    .insert({
      plant_id: plantId,
      analyst_id: body.analyst_id,
      date: body.date,
      season: body.season,
      phase: body.phase,
      answers: {},
      scores: {},
      ...(body.baseline_id ? { baseline_id: body.baseline_id } : {}),
    })
    .select()
    .single()

  if (assessErr || !assessment) {
    return NextResponse.json({ error: assessErr?.message || 'Failed to create assessment' }, { status: 500 })
  }

  return NextResponse.json({ assessment })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await isSystemAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = getAdminClient()
  const { error } = await admin.from('assessments').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
