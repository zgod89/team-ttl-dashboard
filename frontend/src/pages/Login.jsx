import { useState } from 'react'
import { supabase } from '../lib/supabase'

const styles = {
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
  stripes: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    height: '6px',
    background: 'linear-gradient(90deg, #00C4B4 0%, #00C4B4 25%, #FF3D8B 25%, #FF3D8B 50%, #E8B84B 50%, #E8B84B 75%, #FF5A1F 75%, #FF5A1F 100%)',
  },
  stripesTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '6px',
    background: 'linear-gradient(90deg, #00C4B4 0%, #00C4B4 25%, #FF3D8B 25%, #FF3D8B 50%, #E8B84B 50%, #E8B84B 75%, #FF5A1F 75%, #FF5A1F 100%)',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    textAlign: 'center',
  },
  logo: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '64px',
    fontWeight: 900,
    letterSpacing: '4px',
    color: '#fff',
    lineHeight: 1,
    marginBottom: '4px',
  },
  logoSub: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '14px',
    letterSpacing: '6px',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: '48px',
  },
  heading: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '24px',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: '#fff',
    marginBottom: '8px',
  },
  sub: {
    fontSize: '14px',
    color: '#888',
    marginBottom: '32px',
    lineHeight: 1.6,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    background: '#1f1f1f',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    color: '#fff',
    padding: '14px 16px',
    fontSize: '15px',
    fontFamily: 'Barlow, sans-serif',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
  },
  btn: {
    background: '#00C4B4',
    color: '#000',
    border: 'none',
    borderRadius: '6px',
    padding: '14px',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    marginTop: '4px',
  },
  success: {
    background: 'rgba(0, 196, 180, 0.1)',
    border: '1px solid rgba(0, 196, 180, 0.3)',
    borderRadius: '8px',
    padding: '20px',
    color: '#00C4B4',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '16px',
    letterSpacing: '1px',
  },
  error: {
    background: 'rgba(255, 61, 139, 0.1)',
    border: '1px solid rgba(255, 61, 139, 0.3)',
    borderRadius: '6px',
    padding: '12px',
    color: '#FF3D8B',
    fontSize: '13px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '4px 0',
    color: '#444',
    fontSize: '12px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(255,255,255,0.08)',
  },
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.stripesTop} />
      <div style={styles.stripes} />
      <div style={styles.card}>
        <div style={styles.logo}>TTL</div>
        <div style={styles.logoSub}>Team Dashboard</div>

        {sent ? (
          <div style={styles.success}>
            Check your email for a magic link to sign in.
          </div>
        ) : (
          <>
            <div style={styles.heading}>Sign In</div>
            <div style={styles.sub}>
              Enter your email to receive a sign-in link.<br />
              Invite-only — contact your team admin to join.
            </div>
            <form style={styles.form} onSubmit={handleSubmit}>
              <input
                style={styles.input}
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              {error && <div style={styles.error}>{error}</div>}
              <button style={styles.btn} type="submit" disabled={loading}>
                {loading ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
