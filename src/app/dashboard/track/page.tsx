import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OperatorTrackView, { type AssessmentInfo } from './OperatorTrackView'

export const dynamic = 'force-dynamic'

export default async function OperatorTrackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Find the assessment assignment for this operator
  const { data: assignment } = await supabase
    .from('assessment_assignments')
    .select(`
      assessment_id,
      assessment:assessments(
        id, phase,
        plant:plants(name, country),
        answers
      )
    `)
    .eq('user_id', user.id)
    .limit(1)
    .single()

  // Normalize assessment
  let assessment: AssessmentInfo | null = null
  if (assignment?.assessment) {
    const arr = assignment.assessment as unknown[]
    const raw = Array.isArray(arr) ? arr[0] || null : arr
    if (raw && typeof raw === 'object' && 'id' in raw) {
      assessment = raw as AssessmentInfo
      const plantArr = (assessment as { plant: unknown }).plant as unknown[]
      ;(assessment as { plant: unknown }).plant = Array.isArray(plantArr) ? plantArr[0] || null : plantArr
    }
  }

  return (
    <OperatorTrackView
      assessmentId={assignment?.assessment_id ?? null}
      assessment={assessment}
      userId={user.id}
    />
  )
}
