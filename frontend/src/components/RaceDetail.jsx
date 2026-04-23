import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const MEMBER_COLORS = ['#00C4B4','#FF3D8B','#E8B84B','#FF5A1F','#a78bfa','#34d399','#f472b6','#60a5fa']

const ICONS = {
  swim: {
    Ocean: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M2 12c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 17c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 7c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/></svg>,
    Lake: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><ellipse cx="12" cy="13" rx="9" ry="5"/><path d="M12 8V4M9 5l3-1 3 1"/></svg>,
    River: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M3 6c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M3 12c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M3 18c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/></svg>,
    default: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M2 12c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/><path d="M2 17c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/></svg>,
  },
  bike: {
    Flat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M3 16h18"/><circle cx="7" cy="16" r="3"/><circle cx="17" cy="16" r="3"/><path d="M12 16V8l-3 4h6"/></svg>,
    Rolling: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M2 16c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>,
    Hilly: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M2 18L8 8l4 5 4-7 6 10"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>,
    default: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17V9l7-4 7 4v8"/></svg>,
  },
  run: {
    Flat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M3 18h18"/><path d="M13 4c0 1-1 2-2 2s-2-1-2-2 1-2 2-2 2 1 2 2z" fill="currentColor" stroke="none"/><path d="M8 18l3-8 3 4 2-3"/></svg>,
    Rolling: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M2 16c3-6 5-6 7 0s4 6 7 0 3-6 5 0"/><path d="M10 4c0 1-1 2-2 2s-2-1-2-2 1-2 2-2 2 1 2 2z" fill="currentColor" stroke="none"/></svg>,
    Hilly: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M2 18L7 8l5 6 4-8 6 12"/><path d="M10 4c0 1-1 2-2 2s-2-1-2-2 1-2 2-2 2 1 2 2z" fill="currentColor" stroke="none"/></svg>,
    default: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22"><path d="M13 4c0 1-1 2-2 2s-2-1-2-2 1-2 2-2 2 1 2 2z" fill="currentColor" stroke="none"/><path d="M9 7l-2 5h4l2 6"/><path d="M7 12l-3 3M13 12l3 3"/></svg>,
  },
}

function CourseIcon({ category, value, distance }) {
  const icon = ICONS[category]?.[value] || ICONS[category]?.default
  const labels = { swim: 'Swim', bike: 'Bike', run: 'Run' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1 }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00C4B4', background: 'rgba(0,196,180,0.06)' }}>{icon}</div>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999' }}>{labels[category]}</div>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', fontWeight: 600, color: '#fff', textAlign: 'center' }}>{value || '—'}</div>
      {distance && <div style={{ fontSize: '11px', color: '#999' }}>{distance}</div>}
    </div>
  )
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

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { background: '#111', width: '100%', maxWidth: '640px', maxHeight: '92vh', borderRadius: '16px 16px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.25s ease' },
  handle: { width: '40px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', margin: '12px auto 0', flexShrink: 0 },
  header: { padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 },
  closeBtn: { background: 'none', border: 'none', color: '#999', fontSize: '22px', cursor: 'pointer', padding: '0', lineHeight: 1, float: 'right', marginTop: '-2px' },
  raceName: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '22px', fontWeight: 800, letterSpacing: '1px', color: '#fff', marginBottom: '4px', paddingRight: '32px' },
  raceMeta: { fontSize: '13px', color: '#999', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' },
  badge: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', padding: '2px 8px', borderRadius: '3px', textTransform: 'uppercase' },
  body: { overflow: 'auto', flex: 1 },
  section: { padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  sectionTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#555', marginBottom: '12px' },
  courseIcons: { display: 'flex', gap: '8px', justifyContent: 'space-around', padding: '8px 0' },
  iconDivider: { width: '1px', background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' },
  athleteRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', fontWeight: 700, color: '#000', flexShrink: 0 },
  athleteName: { fontSize: '14px', color: '#fff', fontWeight: 500 },
  descText: { fontSize: '14px', color: '#bbb', lineHeight: 1.7 },
  regBtn: { display: 'block', width: '100%', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '15px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', padding: '14px', background: '#00C4B4', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' },
  discussBtn: { display: 'block', width: '100%', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '12px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ccc', cursor: 'pointer', marginTop: '10px', textAlign: 'center' },
  enterBtn: { display: 'block', width: '100%', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '12px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ccc', cursor: 'pointer', marginTop: '10px' },
  enterBtnJoined: { borderColor: '#00C4B4', color: '#00C4B4' },
  loading: { fontSize: '13px', color: '#555', padding: '4px 0' },
  emptyText: { fontSize: '13px', color: '#555', fontStyle: 'italic' },
}

export default function RaceDetail({ race, session, onClose, onToggleEntry, isEntered }) {
  const [entries, setEntries] = useState([])
  const [raceDetails, setRaceDetails] = useState(null)
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(true)
  const [openingThread, setOpeningThread] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    loadEntries()
    loadRaceDetails()
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [race.id])

  async function loadEntries() {
    const { data } = await supabase.from('race_entries').select('*, profiles(full_name, avatar_color, avatar_url)').eq('race_id', race.id)
    if (data) setEntries(data)
    setLoadingEntries(false)
  }

  async function loadRaceDetails() {
    if (!race.registration_url || race.registration_url === 'https://www.ironman.com/races') { setLoadingDetails(false); return }
    try {
      const res = await fetch(`/api/race-details?url=${encodeURIComponent(race.registration_url)}`)
      const data = await res.json()
      if (!data.error) setRaceDetails(data)
    } catch {}
    setLoadingDetails(false)
  }

  async function discussRace() {
    setOpeningThread(true)
    let { data: channel } = await supabase.from('channels').select('id').eq('race_id', race.id).single()
    if (!channel) {
      const slug = race.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const { data: newChannel, error } = await supabase.from('channels')
        .insert({ name: slug, type: 'race', race_id: race.id, description: `Race thread for ${race.name}`, created_by: session.user.id })
        .select('id').single()
      if (error) { console.error('[discussRace]', error.message); setOpeningThread(false); return }
      channel = newChannel
    }
    onClose()
    navigate(`/messages?channel=${channel.id}`)
  }

  const hasCourseInfo = raceDetails?.swimType || raceDetails?.bikeProfile || raceDetails?.runProfile

  return (
    <>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
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

          <div style={S.body}>

            {/* Course profile */}
            <div style={S.section}>
              <div style={S.sectionTitle}>Course Profile</div>
              {loadingDetails ? (
                <div style={S.loading}>Loading course details...</div>
              ) : (
                <div style={S.courseIcons}>
                  <CourseIcon category="swim" value={raceDetails?.swimType} distance={raceDetails?.distances?.swim} />
                  <div style={S.iconDivider} />
                  <CourseIcon category="bike" value={raceDetails?.bikeProfile} distance={raceDetails?.distances?.bike} />
                  <div style={S.iconDivider} />
                  <CourseIcon category="run" value={raceDetails?.runProfile} distance={raceDetails?.distances?.run} />
                </div>
              )}
            </div>

            {/* Description */}
            {!loadingDetails && raceDetails?.description && (
              <div style={S.section}>
                <div style={S.sectionTitle}>About This Race</div>
                <div style={S.descText}>{raceDetails.description}</div>
              </div>
            )}

            {/* Teammates */}
            <div style={S.section}>
              <div style={S.sectionTitle}>Teammates Entered</div>
              {loadingEntries ? <div style={S.loading}>Loading...</div>
                : entries.length === 0 ? <div style={S.emptyText}>No teammates entered yet — be the first!</div>
                : entries.map((entry, idx) => {
                  const name = entry.profiles?.full_name || 'Athlete'
                  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const color = entry.profiles?.avatar_color || MEMBER_COLORS[idx % MEMBER_COLORS.length]
                  return (
                    <div key={entry.id} style={S.athleteRow}>
                      {entry.profiles?.avatar_url
                        ? <img src={entry.profiles.avatar_url} alt={name} style={{ ...S.avatar, objectFit: 'cover' }} />
                        : <div style={{ ...S.avatar, background: color }}>{initials}</div>
                      }
                      <div style={S.athleteName}>{name}</div>
                    </div>
                  )
                })
              }
            </div>

            {/* Actions */}
            <div style={{ ...S.section, borderBottom: 'none' }}>
              {race.registration_url && race.registration_url !== 'https://www.ironman.com/races' && (
                <a href={race.registration_url} target="_blank" rel="noopener noreferrer" style={S.regBtn}>
                  View Race / Register →
                </a>
              )}
              <button style={S.discussBtn} onClick={discussRace} disabled={openingThread}>
                💬 {openingThread ? 'Opening...' : 'Discuss This Race'}
              </button>
              <button
                style={{ ...S.enterBtn, ...(isEntered ? S.enterBtnJoined : {}) }}
                onClick={async () => { await onToggleEntry(race.id); loadEntries() }}
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
