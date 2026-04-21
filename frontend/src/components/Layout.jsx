import { useState } from 'react'
import { supabase } from '../lib/supabase'

const S = {
  wrap: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 1.5rem', height: '56px',
    background: '#161616', borderBottom: '1px solid rgba(255,255,255,0.08)',
    position: 'sticky', top: 0, zIndex: 100,
  },
  stripeBar: {
    height: '3px',
    background: 'linear-gradient(90deg, #00C4B4, #FF3D8B, #E8B84B, #FF5A1F)',
  },
  logo: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '26px', fontWeight: 900, letterSpacing: '3px', color: '#fff',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  logoAccent: { color: '#00C4B4' },
  navRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: {
    width: '32px', height: '32px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #00C4B4, #FF3D8B)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer',
    position: 'relative',
  },
  dropdown: {
    position: 'absolute', top: '40px', right: 0,
    background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', padding: '6px', minWidth: '160px',
    zIndex: 200,
  },
  dropItem: {
    padding: '8px 12px', borderRadius: '4px', fontSize: '13px',
    color: '#ccc', cursor: 'pointer',
    fontFamily: 'Barlow, sans-serif',
  },
  main: { flex: 1 },
}

export default function Layout({ children, session }) {
  const [open, setOpen] = useState(false)
  const email = session?.user?.email || ''
  const initials = email.slice(0, 2).toUpperCase()

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div style={S.wrap}>
      <div style={S.stripeBar} />
      <nav style={S.nav}>
        <div style={S.logo}>
          <span style={S.logoAccent}>TEAM</span> TTL
        </div>
        <div style={S.navRight}>
          <div style={{ ...S.avatar, position: 'relative' }} onClick={() => setOpen(!open)}>
            {initials}
            {open && (
              <div style={S.dropdown}>
                <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: '#555', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'Barlow Condensed' }}>
                  {email}
                </div>
                <div
                  style={S.dropItem}
                  onMouseEnter={e => e.target.style.background = '#2a2a2a'}
                  onMouseLeave={e => e.target.style.background = 'transparent'}
                  onClick={signOut}
                >
                  Sign out
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main style={S.main}>{children}</main>
    </div>
  )
}
