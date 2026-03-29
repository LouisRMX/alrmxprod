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

const countries = ['Saudi Arabia', 'UAE', 'Kuwait', 'Qatar', 'Bahrain', 'Oman']

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', fontFamily: 'var(--font)',
  outline: 'none', background: 'var(--white)', color: 'var(--gray-900)'
}

export default function CustomerDetail({ customer, plants }: { customer: Customer; plants: Plant[] }) {
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

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    const { error } = await supabase.from('customers').update({
      name, country,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
    }).eq('id', customer.id)

    if (error) {
      console.error('Update error:', error)
      setSaveError('Failed to save — please try again.')
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
    const { error } = await supabase.from('customers').delete().eq('id', customer.id)
    if (error) {
      console.error('Delete error:', error)
      setDeleteError('Failed to delete — please try again.')
      setDeleting(false)
      return
    }
    router.push('/dashboard/customers')
    router.refresh()
  }

  const plantCount = plants.length
  const assessmentCount = plants.reduce((s, p) => s + (p.assessments?.[0]?.count || 0), 0)

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
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

        {plants.length === 0 ? (
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
              {plants.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < plants.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '500', color: 'var(--gray-900)' }}>
                    {p.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)' }}>
                    {p.country}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)' }}>
                    {p.assessments?.[0]?.count || 0}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={`/dashboard/assess/new?customer=${customer.id}&plant=${p.id}`} style={{
                      fontSize: '12px', color: 'var(--green)', textDecoration: 'none', fontWeight: '500'
                    }}>
                      New assessment →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
