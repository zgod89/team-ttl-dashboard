import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const S = {
  wrap: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  stripeBar: {
    height: '3px',
    background: 'linear-gradient(90deg, #00C4B4, #FF3D8B, #E8B84B, #FF5A1F)',
  },
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 1.5rem', height: '56px',
    background: '#161616', borderBottom: '1px solid rgba(255,255,255,0.08)',
    position: 'sticky', top: 0, zIndex: 100,
  },
  navLeft: { display: 'flex', alignItems: 'center', gap: '0' },
  logo: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '26px', fontWeight: 900, letterSpacing: '3px', color: '#fff',
    display: 'flex', alignItems: 'center', gap: '6px',
    marginRight: '24px', cursor: 'pointer',
    userSelect: 'none',
  },
  logoAccent: { color: '#00C4B4' },
  navLink: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase',
    padding: '0 16px', height: '56px',
    display: 'flex', alignItems: 'center',
    color: '#999', cursor: 'pointer',
    transition: 'all 0.15s',
    background: 'none', border: 'none',
    borderBottom: '2px solid transparent',
  },
  navLinkActive: {
    color: '#fff',
    borderBottom: '2px solid #00C4B4',
  },
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
    borderRadius: '8px', padding: '6px', minWidth: '180px',
    zIndex: 200,
  },
  dropEmail: {
    padding: '8px 12px 6px',
    fontSize: '11px', color: '#444',
    letterSpacing: '0.5px',
    fontFamily: 'Barlow, sans-serif',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '4px',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  dropItem: {
    padding: '8px 12px', borderRadius: '4px', fontSize: '13px',
    color: '#ccc', cursor: 'pointer',
    fontFamily: 'Barlow, sans-serif',
    transition: 'background 0.1s',
  },
  main: { flex: 1 },
}

const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Races', path: '/races' },
]

export default function Layout({ children, session }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const email = session?.user?.email || ''
  const initials = email.slice(0, 2).toUpperCase()

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div style={S.wrap}>
      <div style={S.stripeBar} />
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <div style={S.logo} onClick={() => navigate('/')}>
            <span style={S.logoAccent}>TEAM</span> TTL
          </div>
          {NAV_LINKS.map(link => (
            <button
              key={link.path}
              style={{
                ...S.navLink,
                ...(location.pathname === link.path ? S.navLinkActive : {}),
              }}
              onClick={() => navigate(link.path)}
            >
              {link.label}
            </button>
          ))}
        </div>

        <div style={S.navRight}>
          <div style={{ ...S.avatar, position: 'relative' }} onClick={() => setOpen(!open)}>
            {initials}
            {open && (
              <div style={S.dropdown} onClick={e => e.stopPropagation()}>
                <div style={S.dropEmail}>{email}</div>
                <div
                  style={S.dropItem}
                  onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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
