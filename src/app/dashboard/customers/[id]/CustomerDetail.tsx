'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Plant {
  id: string
  name: string
  country: string
  created_at: string
  assessments: { count: number }[]
}

interface Customer {
  id: string
  name: string
  country: string
  contact_name: string | null
  contact_email: string | null
}

interface Member {
  id: string
  user_id: string
  role: string
  created_at: string
  profile?: { full_name: string | null; email: string }
}

const countries = ['Saudi Arabia', 'UAE', 'Kuwait', 'Qatar', 'Bahrain', 'Oman']

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', fontFamily: 'var(--font)',
  outline: 'none', background: 'var(--white)', color: 'var(--gray-900)'
}

export default function CustomerDetail({ customer, plants, members: initialMembers }: { customer: Customer; plants: Plant[]; members: Member[] }) {
  const supabase = createClient()
  const router = useRouter()

  // Edit state
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(customer.name)
  const [country, setCountry] = useState(customer.country)
  const [contactName, setContactName] = useState(customer.contact_name || '')
  const [contactEmail, setContactEmail] = useState(customer.contact_email || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Delete state
  const [showDelete, setShowDelete] = useState(false)
  const [deleteTyped, setDeleteTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Plant delete state
  const [plantList, setPlantList] = useState(plants)
  const [deletingPlantId, setDeletingPlantId] = useState<string | null>(null)

  async function deletePlant(plantId: string) {
    setDeletingPlantId(plantId)
    await supabase.from('plants').delete().eq('id', plantId)
    setPlantList(prev => prev.filter(p => p.id !== plantId))
    setDeletingPlantId(null)
  }

  // Team/invite state
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'manager' | 'operator'>('manager')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const resp = await fetch('/api/admin/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customer.id,
          name, country,
          contact_name: contactName || null,
          contact_email: contactEmail || null,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || 'Update failed')
      }
    } catch (err) {
      console.error('Update error:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to save, please try again.')
      setSaving(false)
      return
    }

    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  async function handleDelete() {
    if (deleteTyped.toLowerCase() !== customer.name.toLowerCase()) return
    setDeleting(true)
    setDeleteError('')
    try {
      const resp = await fetch('/api/admin/customers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: customer.id }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || `Delete failed (${resp.status})`)
      }
      router.push('/dashboard/customers')
      router.refresh()
    } catch (err) {
      console.error('Delete error:', err)
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete, please try again.')
      setDeleting(false)
    }
  }

  async function handleInvite() {
    if (!inviteEmail || !inviteName) return
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')

    try {
      const resp = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          fullName: inviteName,
          customerId: customer.id,
          role: inviteRole,
        }),
      })

      const data = await resp.json()

      if (!resp.ok) {
        setInviteError(data.error || 'Invite failed')
        setInviting(false)
        return
      }

      setInviteSuccess(data.alreadyExisted
        ? `${inviteEmail} added to team (existing user)`
        : `Invite sent to ${inviteEmail}`)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('manager')
      setShowInvite(false)
      router.refresh()

      // Refresh members list
      const { data: updatedMembers } = await supabase
        .from('customer_members')
        .select('id, user_id, role, created_at, profile:profiles(full_name, email)')
        .eq('customer_id', customer.id)
      if (updatedMembers) {
        setMembers(updatedMembers.map(m => ({
          ...m,
          profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
        })) as Member[])
      }

      setTimeout(() => setInviteSuccess(''), 5000)
    } catch {
      setInviteError('Network error, please try again')
    }
    setInviting(false)
  }

  async function handleRemoveMember(memberId: string) {
    const { error } = await supabase.from('customer_members').delete().eq('id', memberId)
    if (error) return
    setMembers(prev => prev.filter(m => m.id !== memberId))
  }

  const plantCount = plants.length
  const assessmentCount = plants.reduce((s, p) => s + (p.assessments?.[0]?.count || 0), 0)

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)', maxWidth: '900px', margin: '0 auto', overflowX: 'hidden' }}>
      {/* Back link */}
      <Link href="/dashboard/customers" style={{
        fontSize: '13px', color: 'var(--gray-500)', textDecoration: 'none', marginBottom: '16px', display: 'inline-block'
      }}>
        ← Back to customers
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--gray-900)' }}>{customer.name}</h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>
            {customer.country} · {plantCount} plant{plantCount !== 1 ? 's' : ''} · {assessmentCount} assessment{assessmentCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!editing && (
            <button onClick={() => setEditing(true)} style={{
              padding: '8px 16px', background: 'var(--white)', color: 'var(--gray-700)',
              border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
              cursor: 'pointer', fontFamily: 'var(--font)'
            }}>
              Edit
            </button>
          )}
          <button onClick={() => setShowDelete(true)} style={{
            padding: '8px 16px', background: 'var(--white)', color: 'var(--gray-400)',
            border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
            cursor: 'pointer', fontFamily: 'var(--font)', transition: 'color .15s'
          }}
            onMouseEnter={e => (e.currentTarget.style.color = '#C0392B')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--gray-400)')}
          >
            Delete customer
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '20px', marginBottom: '24px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>Edit customer</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                Company name *
              </label>
              <input style={inp} value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                Country *
              </label>
              <select style={inp} value={country} onChange={e => setCountry(e.target.value)}>
                {countries.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                Contact name
              </label>
              <input style={inp} value={contactName} onChange={e => setContactName(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                Contact email
              </label>
              <input style={inp} type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
            </div>
          </div>
          {saveError && (
            <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', fontSize: '12px', color: 'var(--red)' }}>
              {saveError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSave} disabled={saving || !name} style={{
              padding: '9px 20px', background: 'var(--green)', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)'
            }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button onClick={() => { setEditing(false); setName(customer.name); setCountry(customer.country); setContactName(customer.contact_name || ''); setContactEmail(customer.contact_email || '') }} style={{
              padding: '9px 16px', background: 'none', color: 'var(--gray-500)',
              border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
              cursor: 'pointer', fontFamily: 'var(--font)'
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Plants list */}
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--gray-900)' }}>Plants</div>
        </div>

        {plantList.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
            No plants yet. Plants are created when starting a new assessment.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                {['Plant', 'Country', 'Assessments', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', fontSize: '11px', fontWeight: '500',
                    color: 'var(--gray-500)', textAlign: 'left',
                    textTransform: 'uppercase', letterSpacing: '.4px'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plantList.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < plantList.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '500', color: 'var(--gray-900)' }}>
                    {p.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)' }}>
                    {p.country}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)' }}>
                    {p.assessments?.[0]?.count || 0}
                  </td>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href={`/dashboard/assess/new?customer=${customer.id}&plant=${p.id}`} style={{
                      fontSize: '12px', color: 'var(--green)', textDecoration: 'none', fontWeight: '500'
                    }}>
                      New assessment →
                    </Link>
                    <button
                      onClick={() => deletePlant(p.id)}
                      disabled={deletingPlantId === p.id}
                      style={{
                        fontSize: '11px', color: 'var(--gray-400)', background: 'none',
                        border: 'none', cursor: 'pointer', padding: '0', fontFamily: 'var(--font)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--gray-400)'}
                    >
                      {deletingPlantId === p.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Team section */}
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden', marginTop: '16px'
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--gray-900)' }}>Team</div>
          <button onClick={() => setShowInvite(true)} style={{
            padding: '6px 14px', background: 'var(--green)', color: '#fff',
            border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
            cursor: 'pointer', fontFamily: 'var(--font)'
          }}>
            Invite user
          </button>
        </div>

        {inviteSuccess && (
          <div style={{ padding: '10px 20px', background: 'var(--green-light)', fontSize: '12px', color: 'var(--green)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>
            {inviteSuccess}
          </div>
        )}

        {members.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
            No team members yet. Invite users to give them access.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                {['Name', 'Email', 'Role', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', fontSize: '11px', fontWeight: '500',
                    color: 'var(--gray-500)', textAlign: 'left',
                    textTransform: 'uppercase', letterSpacing: '.4px'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '500', color: 'var(--gray-900)' }}>
                    {m.profile?.full_name || '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)' }}>
                    {m.profile?.email || '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                      background: m.role === 'owner' ? 'var(--phase-workshop-bg)'
                               : m.role === 'operator' ? '#F5F0FF'
                               : 'var(--gray-100)',
                      color: m.role === 'owner' ? 'var(--phase-workshop)'
                           : m.role === 'operator' ? '#6B21A8'
                           : 'var(--gray-500)',
                    }}>
                      {m.role === 'owner' ? 'Owner' : m.role === 'operator' ? 'Operator' : 'Manager'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => handleRemoveMember(m.id)} style={{
                      fontSize: '11px', color: 'var(--gray-400)', background: 'none',
                      border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
                    }}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}
          onClick={() => { if (!inviting) { setShowInvite(false); setInviteError('') } }}
        >
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '28px',
            width: '100%', maxWidth: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
          }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--gray-900)', marginBottom: '16px' }}>
              Invite user to {customer.name}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>Full name</label>
              <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="John Smith" style={inp} />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>Email</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="john@company.com" style={inp} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>Role</label>
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                {([
                  { role: 'owner',    label: 'Owner',    desc: 'Sees all plants, reports and simulator. Read-only.' },
                  { role: 'manager',  label: 'Manager',  desc: 'Full access, fills in assessment, views reports, logs tracking.' },
                  { role: 'operator', label: 'Operator', desc: 'Data input only, fills in questions and logs weekly tracking.' },
                ] as const).map(({ role: r, label, desc }) => (
                  <button key={r} type="button" onClick={() => setInviteRole(r)} style={{
                    padding: '10px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                    border: inviteRole === r ? '2px solid var(--green)' : '1px solid var(--border)',
                    background: inviteRole === r ? 'var(--green-light)' : 'var(--white)',
                    color: inviteRole === r ? 'var(--green)' : 'var(--gray-500)',
                    cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                  }}>
                    {label}
                    <div style={{ fontSize: '10px', fontWeight: 400, marginTop: '2px', color: 'var(--gray-500)' }}>
                      {desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {inviteError && (
              <div style={{
                background: 'var(--error-bg)', border: '1px solid var(--error-border)',
                borderRadius: '8px', padding: '8px 12px', marginBottom: '12px',
                fontSize: '12px', color: 'var(--red)'
              }}>
                {inviteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowInvite(false); setInviteError('') }} disabled={inviting} style={{
                fontSize: '13px', color: 'var(--gray-600)', background: 'none',
                border: '1px solid var(--border)', borderRadius: '8px',
                padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--font)'
              }}>
                Cancel
              </button>
              <button onClick={handleInvite} disabled={!inviteEmail || !inviteName || inviting} style={{
                fontSize: '13px', color: '#fff', background: 'var(--green)',
                border: 'none', borderRadius: '8px', padding: '8px 16px',
                cursor: inviteEmail && inviteName && !inviting ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font)', fontWeight: '500',
              }}>
                {inviting ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}
          onClick={() => { if (!deleting) { setShowDelete(false); setDeleteTyped('') } }}
        >
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '28px',
            width: '100%', maxWidth: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
          }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--gray-900)', marginBottom: '8px' }}>
              Delete customer
            </div>
            <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '4px', lineHeight: '1.5' }}>
              This will permanently delete <strong>{customer.name}</strong> and all associated plants, assessments, reports, and action items.
            </p>
            {assessmentCount > 0 && (
              <p style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '12px', lineHeight: '1.5' }}>
                Warning: {assessmentCount} assessment{assessmentCount !== 1 ? 's' : ''} will be deleted.
              </p>
            )}
            <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '12px' }}>
              Type <strong style={{ color: 'var(--red)' }}>{customer.name}</strong> to confirm:
            </p>
            <input
              type="text" value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)}
              placeholder={customer.name} autoFocus
              style={{ ...inp, marginBottom: '16px' }}
            />
            {deleteError && (
              <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: 'var(--red)' }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowDelete(false); setDeleteTyped('') }} disabled={deleting} style={{
                fontSize: '13px', color: 'var(--gray-600)', background: 'none',
                border: '1px solid var(--border)', borderRadius: '8px',
                padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--font)'
              }}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteTyped.toLowerCase() !== customer.name.toLowerCase() || deleting}
                style={{
                  fontSize: '13px', color: '#fff',
                  background: deleteTyped.toLowerCase() === customer.name.toLowerCase() ? 'var(--red)' : '#e0a8a4',
                  border: 'none', borderRadius: '8px', padding: '8px 16px',
                  cursor: deleteTyped.toLowerCase() === customer.name.toLowerCase() && !deleting ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font)', fontWeight: '500', transition: 'background .15s'
                }}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
