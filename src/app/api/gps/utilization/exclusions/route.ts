/**
 * /api/gps/utilization/exclusions
 *
 * CRUD for utilization_exclusions. Each row is a date range that baseline
 * compute filters out AND that can be computed separately in within_period
 * mode for period-specific analysis (primary use case: Ramadan).
 *
 * GET    ?assessmentId=... — list all exclusions for the assessment
 * POST                      — create an exclusion ({assessmentId, start_date, end_date, reason, label})
 * DELETE ?id=...            — hard delete (cascades clear exclusion_id on result rows via SET NULL)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CreateBody {
  assessmentId?: string
  start_date?: string
  end_date?: string
  reason?: 'ramadan' | 'eid' | 'holiday' | 'maintenance' | 'other'
  label?: string
  active?: boolean
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const assessmentId = req.nextUrl.searchParams.get('assessmentId')
  if (!assessmentId) {
    return NextResponse.json({ error: 'assessmentId required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('utilization_exclusions')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('start_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ exclusions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as CreateBody | null
  if (!body?.assessmentId || !body.start_date || !body.end_date || !body.label) {
    return NextResponse.json(
      { error: 'assessmentId, start_date, end_date, label required' },
      { status: 400 },
    )
  }

  if (body.end_date < body.start_date) {
    return NextResponse.json(
      { error: 'end_date must be on or after start_date' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('utilization_exclusions')
    .insert({
      assessment_id: body.assessmentId,
      start_date: body.start_date,
      end_date: body.end_date,
      reason: body.reason ?? 'other',
      label: body.label,
      active: body.active ?? true,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ exclusion: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('utilization_exclusions')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
