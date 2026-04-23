/**
 * GET / POST /api/gps/utilization/profile
 *
 * CRUD for plant_operational_profile rows. User confirms plant clusters
 * (Malham vs Derab) and enters per-plant batching-mixer counts; those
 * rows are then consumed by /api/gps/utilization/compute.
 *
 * GET  ?assessmentId=...       → all profiles for the assessment
 * POST { assessmentId, plants }  → upsert a batch of profile rows
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ProfileInput {
  plant_slug: string
  plant_name: string
  centroid_lat: number
  centroid_lon: number
  centroid_source?: 'verified' | 'proxy' | 'default'
  plant_radius_m?: number
  batching_mixer_count: number
  batching_mixer_count_source?: 'verified' | 'proxy' | 'default'
  capacity_per_mixer_m3_per_hr?: number
  capacity_per_mixer_source?: 'verified' | 'proxy' | 'default'
  notes?: string | null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assessmentId = req.nextUrl.searchParams.get('assessmentId')
  if (!assessmentId) {
    return NextResponse.json({ error: 'assessmentId required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('plant_operational_profile')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('plant_slug')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profiles: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    assessmentId?: string
    plants?: ProfileInput[]
  } | null

  if (!body?.assessmentId || !Array.isArray(body.plants) || body.plants.length === 0) {
    return NextResponse.json(
      { error: 'assessmentId and non-empty plants[] required' },
      { status: 400 },
    )
  }

  const rows = body.plants.map(p => ({
    assessment_id: body.assessmentId!,
    plant_slug: p.plant_slug,
    plant_name: p.plant_name,
    centroid_lat: p.centroid_lat,
    centroid_lon: p.centroid_lon,
    centroid_source: p.centroid_source ?? 'proxy',
    plant_radius_m: p.plant_radius_m ?? 500,
    batching_mixer_count: p.batching_mixer_count,
    batching_mixer_count_source: p.batching_mixer_count_source ?? 'verified',
    capacity_per_mixer_m3_per_hr: p.capacity_per_mixer_m3_per_hr ?? 90.0,
    capacity_per_mixer_source: p.capacity_per_mixer_source ?? 'default',
    notes: p.notes ?? null,
    last_validated_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('plant_operational_profile')
    .upsert(rows, { onConflict: 'assessment_id,plant_slug' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profiles: data ?? [] })
}
