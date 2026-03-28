import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SimulatorClient from './SimulatorClient'

export default async function SimulatorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard/reports')

  // Get all completed assessments with scores
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await supabase
    .from('assessments')
    .select(`
      id, overall, bottleneck, ebitda_monthly, answers, scores,
      plant:plants(name, country, customer:customers(name))
    `)
    .not('overall', 'is', null)
    .order('created_at', { ascending: false }) as { data: any[] | null }

  // Normalize Supabase joined data shape (joins return arrays)
  const assessments = (data || []).map((a: any) => {
    const plant = Array.isArray(a.plant) ? a.plant[0] : a.plant
    if (plant && Array.isArray(plant.customer)) {
      plant.customer = plant.customer[0] || undefined
    }
    return { ...a, plant }
  })

  return <SimulatorClient assessments={assessments} />
}
