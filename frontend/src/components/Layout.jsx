import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Icons as simple SVG components
const HomeIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
    <path d="M3 12L12 3l9 9"/>
    <path d="M9 21V12h6v9"/>
    <path d="M3 12v9h18V12"/>
  </svg>
)
const RaceIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3 3"/>
  </svg>
)
const MessageIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
)
const TrainingIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>
)
const DiscountIcon = ({ active }) => (  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
    <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
)
const ProfileIcon = ({ active, avatarUrl, color, initials }) => {
  if (avatarUrl) return <img src={avatarUrl} alt="profile" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: active ? '2px solid #00C4B4' : '1.5px solid rgba(255,255,255,0.2)' }} />
  return (
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: active ? '#00C4B4' : (color || '#444'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#000', border: active ? '2px solid #00C4B4' : 'none', fontFamily: 'Barlow Condensed, sans-serif' }}>
      {initials}
    </div>
  )
}

const TABS = [
  { path: '/', label: 'Home' },
  { path: '/races', label: 'Races' },
  { path: '/training', label: 'Training' },
  { path: '/messages', label: 'Messages' },
  { path: '/discounts', label: 'Discounts' },
  { path: '/profile', label: 'Profile' },
]

const DESKTOP_NAV = [
  { path: '/', label: 'Home' },
  { path: '/races', label: 'Races' },
  { path: '/training', label: 'Training' },
  { path: '/messages', label: 'Messages' },
  { path: '/discounts', label: 'Discounts' },
]

export default function Layout({ children, session, profile, onNavigateProfile, unreadCount = 0 }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [desktopDropdown, setDesktopDropdown] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  const email = session?.user?.email || ''
  const initials = (profile?.full_name || email).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const avatarColor = profile?.avatar_color || '#00C4B4'
  const avatarUrl = profile?.avatar_url || null

  const signOut = async () => { await supabase.auth.signOut() }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* Top stripe only */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #00C4B4, #FF3D8B, #E8B84B, #FF5A1F)', flexShrink: 0 }} />

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </main>

        {/* Bottom tab bar */}
        <nav style={{
          display: 'flex', background: '#161616',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          flexShrink: 0, zIndex: 100,
        }}>
          {TABS.map(tab => {
            const active = location.pathname === tab.path
            const isMessages = tab.path === '/messages'
            const isProfile = tab.path === '/profile'
            return (
              <button
                key={tab.path}
                onClick={() => isProfile ? onNavigateProfile() : navigate(tab.path)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: '8px 4px 6px',
                  background: 'none', border: 'none',
                  color: active ? '#00C4B4' : '#555',
                  cursor: 'pointer', position: 'relative',
                  transition: 'color 0.15s',
                }}
              >
                {tab.path === '/' && <HomeIcon active={active} />}
                {tab.path === '/races' && <RaceIcon active={active} />}
                {tab.path === '/training' && <TrainingIcon active={active} />}
                {tab.path === '/messages' && <MessageIcon active={active} />}
                {tab.path === '/discounts' && <DiscountIcon active={active} />}
                {isProfile && <ProfileIcon active={active} avatarUrl={avatarUrl} color={avatarColor} initials={initials} />}
                <span style={{ fontSize: '10px', marginTop: '3px', letterSpacing: '0.5px', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase' }}>
                  {tab.label}
                </span>
                {isMessages && unreadCount > 0 && (
                  <div style={{ position: 'absolute', top: '6px', left: '50%', marginLeft: '6px', background: '#FF3D8B', color: '#fff', fontSize: '9px', fontWeight: 700, borderRadius: '8px', padding: '1px 4px', minWidth: '14px', textAlign: 'center', fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </div>
                )}
              </button>
            )
          })}
        </nav>
      </div>
    )
  }

  // Desktop — keep top nav
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ height: '3px', background: 'linear-gradient(90deg, #00C4B4, #FF3D8B, #E8B84B, #FF5A1F)' }} />
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: '56px', background: '#161616', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <button style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '26px', fontWeight: 900, letterSpacing: '3px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', marginRight: '16px', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} onClick={() => navigate('/')}>
            <span style={{ color: '#00C4B4' }}>TEAM</span> TTL
          </button>
          {DESKTOP_NAV.map(link => (
            <button key={link.path}
              style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase', padding: '0 12px', height: '56px', display: 'flex', alignItems: 'center', color: location.pathname === link.path ? '#fff' : '#888', cursor: 'pointer', background: 'none', border: 'none', borderBottom: location.pathname === link.path ? '2px solid #00C4B4' : '2px solid transparent', transition: 'all 0.15s', position: 'relative', flexShrink: 0 }}
              onClick={() => navigate(link.path)}
            >
              {link.label}
              {link.path === '/messages' && unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '10px', right: '4px', background: '#FF3D8B', color: '#fff', fontSize: '10px', fontWeight: 700, borderRadius: '8px', padding: '1px 5px', fontFamily: 'Barlow Condensed, sans-serif' }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Avatar dropdown */}
          <div style={{ position: 'relative' }}>
            <div onClick={() => setDesktopDropdown(p => !p)} style={{ cursor: 'pointer' }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, color: '#000' }}>{initials}</div>
              }
            </div>
            {desktopDropdown && (
              <div style={{ position: 'absolute', top: '42px', right: 0, background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '6px', minWidth: '180px', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                <div style={{ padding: '8px 12px 6px', fontSize: '11px', color: '#555', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Barlow, sans-serif' }}>{email}</div>
                <button style={{ padding: '8px 12px', borderRadius: '4px', fontSize: '13px', color: '#ccc', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  onClick={() => { setDesktopDropdown(false); onNavigateProfile() }}>Profile Settings</button>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                <button style={{ padding: '8px 12px', borderRadius: '4px', fontSize: '13px', color: '#FF3D8B', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  onClick={signOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main style={{ flex: 1 }} onClick={() => desktopDropdown && setDesktopDropdown(false)}>{children}</main>
    </div>
  )
}
