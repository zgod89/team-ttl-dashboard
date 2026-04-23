import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MEMBER_COLORS = ['#00C4B4','#FF3D8B','#E8B84B','#FF5A1F','#a78bfa','#34d399','#f472b6','#60a5fa']

const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 300,
    display: 'flex', alignItems: 'flex-end',
    justifyContent: 'center',
    padding: '0',
  },
  sheet: {
    background: '#111',
    width: '100%', maxWidth: '640px',
    maxHeight: '92vh',
    borderRadius: '16px 16px 0 0',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    animation: 'slideUp 0.25s ease',
  },
  handle: {
    width: '40px', height: '4px',
    background: 'rgba(255,255,255,0.2)',
    borderRadius: '2px',
    margin: '12px auto 0',
    flexShrink: 0,
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#999',
    fontSize: '22px', cursor: 'pointer',
    padding: '0', lineHeight: 1, float: 'right',
    marginTop: '-2px',
  },
  raceName: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '22px', fontWeight: 800,
    letterSpacing: '1px', color: '#fff',
    marginBottom: '4px', paddingRight: '32px',
  },
  raceMeta: {
    fontSize: '13px', color: '#999',
    display: 'flex', gap: '12px', flexWrap: 'wrap',
    alignItems: 'center',
  },
  badge: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
    padding: '2px 8px', borderRadius: '3px', textTransform: 'uppercase',
  },
  body: {
    overflow: 'auto', flex: 1, padding: '0',
  },
  section: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase',
    color: '#555', marginBottom: '12px',
  },
  athleteRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    marginBottom: '8px',
  },
  avatar: {
    width: '32px', height: '32px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '12px', fontWeight: 700, color: '#000',
    flexShrink: 0,
  },
  athleteName: {
    fontSize: '14px', color: '#fff', fontWeight: 500,
  },
  descText: {
    fontSize: '14px', color: '#bbb', lineHeight: 1.7,
  },
  regBtn: {
    display: 'block', width: '100%',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '15px', fontWeight: 700,
    letterSpacing: '2px', textTransform: 'uppercase',
    padding: '14px', background: '#00C4B4',
    border: 'none', borderRadius: '8px',
    color: '#000', cursor: 'pointer',
    textAlign: 'center', textDecoration: 'none',
    transition: 'opacity 0.15s',
  },
  enterBtn: {
    display: 'block', width: '100%',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '14px', fontWeight: 600,
    letterSpacing: '1.5px', textTransform: 'uppercase',
    padding: '12px', background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px', color: '#ccc',
    cursor: 'pointer', marginTop: '10px',
    transition: 'all 0.15s',
  },
  enterBtnJoined: {
    borderColor: '#00C4B4', color: '#00C4B4',
  },
  emptyAthletes: {
    fontSize: '13px', color: '#555', fontStyle: 'italic',
  },
  loading: {
    fontSize: '13px', color: '#555', padding: '8px 0',
  },
}

function getBadgeStyle(type) {
  if (type === 'IRONMAN') return { background: 'rgba(0,196,180,0.12)', color: '#00C4B4', border: '1px solid rgba(0,196,180,0.25)' }
  if (type === '70.3') return { background: 'rgba(255,61,139,0.12)', color: '#FF3D8B', border: '1px solid rgba(255,61,139,0.25)' }
  return { background: 'rgba(232,184,75,0.1)', color: '#E8B84B', border: '1px solid rgba(232,184,75,0.2)' }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export default function RaceDetail({ race, session, onClose, onToggleEntry, isEntered }) {
  const [entries, setEntries] = useState([])
  const [description, setDescription] = useState(null)
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadingDesc, setLoadingDesc] = useState(true)

  useEffect(() => {
    loadEntries()
    loadDescription()
    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [race.id])

  async function loadEntries() {
    const { data } = await supabase
      .from('race_entries')
      .select('*, profiles(full_name, avatar_color, avatar_url)')
      .eq('race_id', race.id)
    if (data) setEntries(data)
    setLoadingEntries(false)
  }

  async function loadDescription() {
    // Try to fetch a short description from the registration URL
    if (!race.registration_url) {
      setDescription(null)
      setLoadingDesc(false)
      return
    }
    try {
      // Use a CORS proxy to fetch the race page meta description
      const url = `https://api.allorigins.win/get?url=${encodeURIComponent(race.registration_url)}`
      const res = await fetch(url)
      const data = await res.json()
      const html = data.contents || ''
      // Extract meta description
      const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{20,300})["']/i)
        || html.match(/<meta[^>]*content=["']([^"']{20,300})["'][^>]*name=["']description["']/i)
      if (match) {
        setDescription(match[1].trim())
      } else {
        setDescription(null)
      }
    } catch {
      setDescription(null)
    }
    setLoadingDesc(false)
  }

  const handleToggle = async () => {
    await onToggleEntry(race.id)
    // Reload entries after toggle
    loadEntries()
  }

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
      <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={S.sheet}>
          <div style={S.handle} />

          {/* Header */}
          <div style={S.header}>
            <button style={S.closeBtn} onClick={onClose}>×</button>
            <div style={S.raceName}>{race.name}</div>
            <div style={S.raceMeta}>
              <span>{formatDate(race.race_date)}</span>
              <span>·</span>
              <span>{race.location}</span>
              <span style={{ ...S.badge, ...getBadgeStyle(race.type) }}>{race.type}</span>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={S.body}>

            {/* Teammates entered */}
            <div style={S.section}>
              <div style={S.sectionTitle}>Teammates Entered</div>
              {loadingEntries ? (
                <div style={S.loading}>Loading...</div>
              ) : entries.length === 0 ? (
                <div style={S.emptyAthletes}>No teammates entered yet — be the first!</div>
              ) : (
                entries.map((entry, idx) => {
                  const name = entry.profiles?.full_name || 'Athlete'
                  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const color = entry.profiles?.avatar_color || MEMBER_COLORS[idx % MEMBER_COLORS.length]
                  return (
                    <div key={entry.id} style={S.athleteRow}>
                      {entry.profiles?.avatar_url ? (
                        <img src={entry.profiles.avatar_url} alt={name}
                          style={{ ...S.avatar, objectFit: 'cover' }} />
                      ) : (
                        <div style={{ ...S.avatar, background: color }}>{initials}</div>
                      )}
                      <div style={S.athleteName}>{name}</div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Description */}
            {(loadingDesc || description) && (
              <div style={S.section}>
                <div style={S.sectionTitle}>About This Race</div>
                {loadingDesc ? (
                  <div style={S.loading}>Loading race details...</div>
                ) : (
                  <div style={S.descText}>{description}</div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ ...S.section, borderBottom: 'none' }}>
              {race.registration_url && race.registration_url !== 'https://www.ironman.com/races' && (
                <a
                  href={race.registration_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={S.regBtn}
                >
                  View Race / Register →
                </a>
              )}
              <button
                style={{ ...S.enterBtn, ...(isEntered ? S.enterBtnJoined : {}) }}
                onClick={handleToggle}
              >
                {isEntered ? '✓ Entered — Click to Withdraw' : 'Enter This Race'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
