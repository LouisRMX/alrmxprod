import { redirect } from 'next/navigation'

export default function DemoPlantsPage() {
  redirect('/demo?view=plants')
}
