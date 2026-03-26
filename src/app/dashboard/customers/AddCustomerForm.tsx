'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AddCustomerForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [country, setCountry] = useState('Saudi Arabia')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.from('customers').insert({
      name,
      country,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      created_by: userId,
    })

    if (error) {
      setError('Failed to create customer. Please try again.')
      setLoading(false)
      return
    }

    setName(''); setCountry('Saudi Arabia')
    setContactName(''); setContactEmail('')
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  const inp = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '13px', fontFamily: 'var(--font)',
    outline: 'none', background: 'var(--white)', color: 'var(--gray-900)'
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '10px 20px', background: 'var(--green)', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
            cursor: 'pointer', fontFamily: 'var(--font)'
          }}
        >
          + Add customer
        </button>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>New customer</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                Company name *
              </label>
              <input style={inp} value={name} onChange={e => setName(e.target.value)} required placeholder="Al Noor Ready Mix" />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                Country *
              </label>
              <select style={{ ...inp }} value={country} onChange={e => setCountry(e.target.value)}>
                {['Saudi Arabia', 'UAE', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'].map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                Contact name
              </label>
              <input style={inp} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Mohammed Al-Rashidi" />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                Contact email
              </label>
              <input style={inp} type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="owner@company.com" />
            </div>
          </div>
          {error && <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={loading} style={{
              padding: '9px 20px', background: 'var(--green)', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', fontFamily: 'var(--font)'
            }}>
              {loading ? 'Saving…' : 'Save customer'}
            </button>
            <button type="button" onClick={() => setOpen(false)} style={{
              padding: '9px 16px', background: 'none', color: 'var(--gray-500)',
              border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
              cursor: 'pointer', fontFamily: 'var(--font)'
            }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
