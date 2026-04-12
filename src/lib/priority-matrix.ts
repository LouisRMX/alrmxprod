import type { Issue, ComplexityParams, OrgLevel } from './issues'

export type Quadrant = 'DO_FIRST' | 'PLAN_CAREFULLY' | 'QUICK_WIN' | 'DONT_DO'

export interface PriorityMatrixRow {
  issue_title: string
  issue_dimension: string
  loss_addressed: number
  impact_score: number        // 0-1, loss_addressed / total_loss
  complexity_score: number    // 0-10
  quadrant: Quadrant
  quadrant_source: 'model' | 'consultant'
  override_reason: string | null
  org_level: OrgLevel
  urgency: 'immediate' | 'first_month' | 'medium_term' | 'long_term'
}

export interface PriorityMatrix {
  rows: PriorityMatrixRow[]
  total_loss: number
  do_first_total: number
  plan_carefully_total: number
  quick_win_total: number
}

function calculateComplexity(c: ComplexityParams): number {
  let score = 0
  if (c.requires_contract_change)    score += 3
  if (c.requires_capital)            score += 3
  if (c.external_behavior_change)    score += 2
  if (c.internal_behavior_change)    score += 1
  if (c.org_level === 'management')  score += 1
  if (c.org_level === 'commercial')  score += 2
  if (c.org_level === 'board')       score += 3
  return Math.min(score, 10)
}

function deriveUrgency(quadrant: Quadrant, impactScore: number): 'immediate' | 'first_month' | 'medium_term' | 'long_term' {
  if (quadrant === 'DO_FIRST') return 'immediate'
  if (quadrant === 'QUICK_WIN') return 'first_month'
  if (quadrant === 'PLAN_CAREFULLY' && impactScore > 0.3) return 'first_month'
  if (quadrant === 'PLAN_CAREFULLY') return 'medium_term'
  return 'long_term'
}

function assignQuadrant(impactScore: number, complexityScore: number): Quadrant {
  const highImpact = impactScore > 0.15
  const lowComplexity = complexityScore <= 4
  if (highImpact && lowComplexity) return 'DO_FIRST'
  if (highImpact && !lowComplexity) return 'PLAN_CAREFULLY'
  if (!highImpact && lowComplexity) return 'QUICK_WIN'
  return 'DONT_DO'
}

export function buildPriorityMatrix(
  issues: Issue[],
  totalLoss: number,
): PriorityMatrix {
  const safeTotalLoss = Math.max(totalLoss, 1) // prevent division by zero

  const rows: PriorityMatrixRow[] = issues
    .filter(i => i.complexity != null)
    .map(issue => {
      const impactScore = totalLoss > 0 ? issue.loss / safeTotalLoss : 0
      const complexityScore = calculateComplexity(issue.complexity!)
      const quadrant = assignQuadrant(impactScore, complexityScore)

      return {
        issue_title: issue.t,
        issue_dimension: issue.dimension || 'Other',
        loss_addressed: issue.loss,
        impact_score: Math.round(impactScore * 1000) / 1000, // 3 decimal places
        complexity_score: complexityScore,
        quadrant,
        quadrant_source: 'model' as const,
        override_reason: null,
        org_level: issue.complexity!.org_level,
        urgency: deriveUrgency(quadrant, impactScore),
      }
    })
    .sort((a, b) => b.impact_score - a.impact_score)

  return {
    rows,
    total_loss: totalLoss,
    do_first_total: rows.filter(r => r.quadrant === 'DO_FIRST').reduce((s, r) => s + r.loss_addressed, 0),
    plan_carefully_total: rows.filter(r => r.quadrant === 'PLAN_CAREFULLY').reduce((s, r) => s + r.loss_addressed, 0),
    quick_win_total: rows.filter(r => r.quadrant === 'QUICK_WIN').reduce((s, r) => s + r.loss_addressed, 0),
  }
}
