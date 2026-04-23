import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const S = {
  wrap: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  stripeBar: { height: '3px', background: 'linear-gradient(90deg, #00C4B4, #FF3D8B, #E8B84B, #FF5A1F)' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: '56px', background: '#161616', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 100 },
  navLeft: { display: 'flex', alignItems: 'center', gap: '0', overflow: 'auto' },
  logo: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '26px', fontWeight: 900, letterSpacing: '3px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', marginRight: '16px', cursor: 'pointer', userSelect: 'none', background: 'none', border: 'none', padding: 0, flexShrink: 0 },
  logoAccent: { color: '#00C4B4' },
  navLink: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase', padding: '0 12px', height: '56px', display: 'flex', alignItems: 'center', color: '#888', cursor: 'pointer', background: 'none', border: 'none', borderBottom: '2px solid transparent', transition: 'all 0.15s', flexShrink: 0, position: 'relative' },
  navLinkActive: { color: '#fff', borderBottom: '2px solid #00C4B4' },
  navRight: { display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 },
  avatarWrap: { position: 'relative' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 700, color: '#000', cursor: 'pointer', overflow: 'hidden' },
  avatarImg: { width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' },
  dropdown: { position: 'absolute', top: '42px', right: 0, background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '6px', minWidth: '180px', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  dropEmail: { padding: '8px 12px 6px', fontSize: '11px', color: '#555', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Barlow, sans-serif' },
  dropItem: { padding: '8px 12px', borderRadius: '4px', fontSize: '13px', color: '#ccc', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', background: 'none', border: 'none', width: '100%', textAlign: 'left', display: 'block' },
  dropDivider: { height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' },
  unreadBadge: { position: 'absolute', top: '10px', right: '4px', background: '#FF3D8B', color: '#fff', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', fontWeight: 700, borderRadius: '8px', padding: '1px 5px', minWidth: '16px', textAlign: 'center', lineHeight: '14px' },
  main: { flex: 1 },
}

const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Races', path: '/races' },
  { label: 'My Races', path: '/my-races' },
  { label: 'Messages', path: '/messages' },
]

export default function Layout({ children, session, profile, onNavigateProfile, unreadCount = 0 }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const email = session?.user?.email || ''
  const initials = (profile?.full_name || email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const avatarColor = profile?.avatar_color || '#00C4B4'
  const avatarUrl = profile?.avatar_url || null

  const signOut = async () => { await supabase.auth.signOut(); setOpen(false) }

  return (
    <div style={S.wrap}>
      <div style={S.stripeBar} />
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <button style={S.logo} onClick={() => navigate('/')}>
            <span style={S.logoAccent}>TEAM</span> TTL
          </button>
          {NAV_LINKS.map(link => (
            <button
              key={link.path}
              style={{ ...S.navLink, ...(location.pathname === link.path ? S.navLinkActive : {}) }}
              onClick={() => navigate(link.path)}
            >
              {link.label}
              {link.path === '/messages' && unreadCount > 0 && (
                <span style={S.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        <div style={S.navRight}>
          <div style={S.avatarWrap}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={S.avatarImg} onClick={() => setOpen(!open)} />
            ) : (
              <div style={{ ...S.avatar, background: avatarColor }} onClick={() => setOpen(!open)}>
                {initials}
              </div>
            )}
            {open && (
              <div style={S.dropdown}>
                <div style={S.dropEmail}>{email}</div>
                <button style={S.dropItem} onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'} onMouseLeave={e => e.currentTarget.style.background = 'none'} onClick={() => { onNavigateProfile(); setOpen(false) }}>
                  Profile Settings
                </button>
                <div style={S.dropDivider} />
                <button style={{ ...S.dropItem, color: '#FF3D8B' }} onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'} onMouseLeave={e => e.currentTarget.style.background = 'none'} onClick={signOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main style={S.main} onClick={() => open && setOpen(false)}>{children}</main>
    </div>
  )
}
