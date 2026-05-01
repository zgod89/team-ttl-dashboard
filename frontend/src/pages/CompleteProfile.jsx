import { useState } from 'react'
import { supabase } from '../lib/supabase'

const S = {
  page: {
    minHeight: '100vh',
    background: '#0d0d0d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    position: 'relative',
    overflow: 'hidden',
  },
  stripesTop: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '4px',
    background: 'linear-gradient(90deg, #00C4B4 0%, #00C4B4 25%, #FF3D8B 25%, #FF3D8B 50%, #E8B84B 50%, #E8B84B 75%, #FF5A1F 75%)',
  },
  stripesBottom: {
    position: 'absolute', bottom: 0, left: 0, width: '100%', height: '4px',
    background: 'linear-gradient(90deg, #00C4B4 0%, #00C4B4 25%, #FF3D8B 25%, #FF3D8B 50%, #E8B84B 50%, #E8B84B 75%, #FF5A1F 75%)',
  },
  card: {
    width: '100%', maxWidth: '440px', textAlign: 'center',
  },
  logo: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '56px', fontWeight: 900, letterSpacing: '4px',
    color: '#fff', lineHeight: 1, marginBottom: '4px',
  },
  logoAccent: { color: '#00C4B4' },
  logoSub: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '13px', letterSpacing: '5px', color: '#999',
    textTransform: 'uppercase', marginBottom: '48px',
  },
  heading: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '26px', fontWeight: 700,
    letterSpacing: '2px', textTransform: 'uppercase',
    color: '#fff', marginBottom: '8px',
  },
  sub: {
    fontSize: '14px', color: '#999',
    marginBottom: '32px', lineHeight: 1.6,
  },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: {
    background: '#1f1f1f',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px', color: '#fff',
    padding: '14px 16px', fontSize: '16px',
    fontFamily: 'Barlow, sans-serif',
    outline: 'none', width: '100%',
    transition: 'border-color 0.15s',
    textAlign: 'center', letterSpacing: '0.5px',
  },
  hint: {
    fontSize: '12px', color: '#555', marginTop: '-4px',
  },
  btn: {
    background: '#00C4B4', color: '#000',
    border: 'none', borderRadius: '6px',
    padding: '14px', marginTop: '4px',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '16px', fontWeight: 700,
    letterSpacing: '2px', textTransform: 'uppercase',
    cursor: 'pointer', transition: 'opacity 0.15s',
  },
  error: {
    background: 'rgba(255,61,139,0.1)',
    border: '1px solid rgba(255,61,139,0.2)',
    borderRadius: '6px', padding: '10px',
    color: '#FF3D8B', fontSize: '13px',
  },
}

export default function CompleteProfile({ session, onComplete }) {
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const name = fullName.trim()
    if (!name || name.length < 2) {
      setError('Please enter your full name.')
      return
    }

    setLoading(true)
    setError('')

    const userId = session.user.id
    const email = session.user.email

    const { error: insertError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: name,
      email,
      role: 'athlete',
    }, { onConflict: 'id' })

    if (insertError) {
      setError('Something went wrong — please try again.')
      console.error('[CompleteProfile]', insertError.message)
      setLoading(false)
      return
    }

    // Also update user metadata so it's available session-wide
    await supabase.auth.updateUser({ data: { full_name: name } })

    // Award the welcome badge — ignore errors (badge may already exist or not yet seeded)
    await supabase.from('profile_badges').insert({
      athlete_id: userId,
      badge_key:  'welcome_team',
    })

    onComplete()
  }

  return (
    <div style={S.page}>
      <div style={S.stripesTop} />
      <div style={S.stripesBottom} />
      <div style={S.card}>
        <div style={S.logo}>
          <span style={S.logoAccent}>TEAM</span> TTL
        </div>
        <div style={S.logoSub}>Team Dashboard</div>

        <div style={S.heading}>Welcome to the team!</div>
        <div style={S.sub}>
          Before you dive in, tell us your name<br />so your teammates know who you are.
        </div>

        <form style={S.form} onSubmit={handleSubmit}>
          <input
            style={S.input}
            type="text"
            placeholder="Your full name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            autoFocus
            required
          />
          <div style={S.hint}>e.g. Zack Godwin</div>
          {error && <div style={S.error}>{error}</div>}
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? 'Saving...' : "Let's go 🤘"}
          </button>
        </form>
      </div>
    </div>
  )
}
