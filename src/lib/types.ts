export type UserRole = 'admin' | 'customer'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
}

export interface Customer {
  id: string
  name: string
  country: string
  contact_email: string | null
  contact_name: string | null
  created_by: string
  created_at: string
}

export interface Plant {
  id: string
  customer_id: string
  name: string
  country: string
  created_at: string
  customer?: Customer
}

export interface Assessment {
  id: string
  plant_id: string
  analyst_id: string
  date: string
  season: 'peak' | 'summer'
  answers: Record<string, unknown>
  scores: {
    prod: number | null
    dispatch: number | null
    fleet: number | null
    quality: number | null
  }
  overall: number | null
  bottleneck: string | null
  ebitda_monthly: number | null
  hidden_rev_monthly: number | null
  is_baseline: boolean
  baseline_id: string | null
  created_at: string
  plant?: Plant
  analyst?: Profile
}

export interface Report {
  id: string
  assessment_id: string
  executive: string | null
  diagnosis: string | null
  actions: string | null
  edited: boolean
  created_at: string
  updated_at: string
}

export interface ActionItem {
  id: string
  assessment_id: string
  text: string
  status: 'todo' | 'in_progress' | 'done'
  owner: string | null
  value: string | null
  created_at: string
  updated_at: string
}
