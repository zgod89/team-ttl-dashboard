import { useState } from 'react'
import { supabase } from '../lib/supabase'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: '1rem',
  },
  modal: {
    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
    borderTop: '3px solid #FF3D8B',
    borderRadius: '10px', padding: '2rem',
    width: '100%', maxWidth: '420px',
  },
  title: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '22px', fontWeight: 700, letterSpacing: '2px',
    textTransform: 'uppercase', color: '#FF3D8B', marginBottom: '4px',
  },
  sub: { fontSize: '13px', color: '#555', marginBottom: '1.5rem' },
  group: { marginBottom: '12px' },
  label: {
    display: 'block',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase',
    color: '#555', marginBottom: '6px',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' },
  btnCancel: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase',
    padding: '10px 20px', background: 'none',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '5px', color: '#666', cursor: 'pointer',
  },
  btnSubmit: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase',
    padding: '10px 24px', background: '#FF3D8B',
    border: 'none', borderRadius: '5px', color: '#fff', cursor: 'pointer',
  },
  success: {
    background: 'rgba(0,196,180,0.1)', border: '1px solid rgba(0,196,180,0.25)',
    borderRadius: '6px', padding: '12px',
    color: '#00C4B4', fontSize: '14px', fontFamily: 'Barlow Condensed',
    letterSpacing: '0.5px',
  },
  error: {
    background: 'rgba(255,61,139,0.1)', border: '1px solid rgba(255,61,139,0.2)',
    borderRadius: '6px', padding: '10px',
    color: '#FF3D8B', fontSize: '13px',
  },
}

export default function InviteModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    if (!email || !name) return
    setLoading(true)
    setError('')

    // Send magic link invite via Supabase Auth
    const { error } = await supabase.auth.admin?.inviteUserByEmail
      ? await supabase.auth.admin.inviteUserByEmail(email, { data: { full_name: name } })
      : await supabase.auth.signInWithOtp({ email, options: { data: { full_name: name } } })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.title}>Invite Member</div>
        <div style={S.sub}>They'll receive a magic link to join Team TTL.</div>
        {sent ? (
          <div style={S.success}>Invite sent to {email}!</div>
        ) : (
          <>
            <div style={S.group}>
              <label style={S.label}>Full Name</label>
              <input placeholder="Alex Smith" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={S.group}>
              <label style={S.label}>Email Address</label>
              <input type="email" placeholder="alex@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            {error && <div style={S.error}>{error}</div>}
          </>
        )}
        <div style={S.actions}>
          <button style={S.btnCancel} onClick={onClose}>{sent ? 'Close' : 'Cancel'}</button>
          {!sent && <button style={S.btnSubmit} onClick={send} disabled={loading}>{loading ? 'Sending...' : 'Send Invite'}</button>}
        </div>
      </div>
    </div>
  )
}
