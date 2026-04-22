/**
 * GET/POST/DELETE endpoint for field_guide_progress rows.
 *
 * GET  /api/field-guide/progress?assessmentId=...  → all rows for the user
 * POST /api/field-guide/progress                    → upsert one row
 * DELETE /api/field-guide/progress?id=...           → delete one row
 *
 * Storage is per-user per-assessment. RLS enforces that a user can only
 * see/mutate their own rows (admins see all).
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assessmentId = req.nextUrl.searchParams.get('assessmentId')
  if (!assessmentId) {
    return NextResponse.json({ error: 'assessmentId required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('field_guide_progress')
    .select('id, item_type, item_id, status, note, usd_adjusted, completed_at, updated_at')
    .eq('assessment_id', assessmentId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    assessmentId?: string
    itemType?: string
    itemId?: string
    status?: string
    note?: string | null
    usdAdjusted?: number | null
  } | null

  if (!body || !body.assessmentId || !body.itemType || !body.itemId || !body.status) {
    return NextResponse.json({ error: 'assessmentId, itemType, itemId, status required' }, { status: 400 })
  }

  const allowedStatuses = ['todo', 'in_progress', 'confirmed', 'invalidated', 'partial', 'failed', 'skipped', 'triggered']
  if (!allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${allowedStatuses.join(', ')}` }, { status: 400 })
  }

  const completedStatuses = ['confirmed', 'invalidated', 'partial', 'failed', 'skipped', 'triggered']
  const completedAt = completedStatuses.includes(body.status) ? new Date().toISOString() : null

  // Upsert — unique on (assessment_id, user_id, item_type, item_id)
  const { data, error } = await supabase
    .from('field_guide_progress')
    .upsert(
      {
        assessment_id: body.assessmentId,
        user_id: user.id,
        item_type: body.itemType,
        item_id: body.itemId,
        status: body.status,
        note: body.note ?? null,
        usd_adjusted: body.usdAdjusted ?? null,
        completed_at: completedAt,
      },
      { onConflict: 'assessment_id,user_id,item_type,item_id' }
    )
    .select('id, item_type, item_id, status, note, usd_adjusted, completed_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ row: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('field_guide_progress')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
