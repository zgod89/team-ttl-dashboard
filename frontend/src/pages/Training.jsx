import { useState, useEffect, Component } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ChallengeCard from '../components/ChallengeCard'
import ChallengeAdminModal from '../components/ChallengeAdminModal'

const STRAVA_ORANGE = '#FC4C02'

const TYPE_CONFIG = {
  'Swim':           { emoji: '🏊', color: '#00C4B4', bg: 'rgba(0,196,180,0.12)' },
  'Bike':           { emoji: '🚴', color: '#FF5A1F', bg: 'rgba(255,90,31,0.12)' },
  'Ride':           { emoji: '🚴', color: '#FF5A1F', bg: 'rgba(255,90,31,0.12)' },
  'VirtualRide':    { emoji: '🚴', color: '#FF5A1F', bg: 'rgba(255,90,31,0.12)' },
  'Run':            { emoji: '🏃', color: '#FF3D8B', bg: 'rgba(255,61,139,0.12)' },
  'VirtualRun':     { emoji: '🏃', color: '#FF3D8B', bg: 'rgba(255,61,139,0.12)' },
  'Walk':           { emoji: '🚶', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  'Hike':           { emoji: '🥾', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  'WeightTraining': { emoji: '💪', color: '#E8B84B', bg: 'rgba(232,184,75,0.12)' },
  'Workout':        { emoji: '⚡', color: '#E8B84B', bg: 'rgba(232,184,75,0.12)' },
  'Yoga':           { emoji: '🧘', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  'Kayaking':       { emoji: '🛶', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  'Soccer':         { emoji: '⚽', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  'Tennis':         { emoji: '🎾', color: '#E8B84B', bg: 'rgba(232,184,75,0.12)' },
}

function getType(sport_type) {
  return TYPE_CONFIG[sport_type] || { emoji: '🏅', color: '#aaa', bg: 'rgba(255,255,255,0.06)' }
}

function stravaUrl(activityId) {
  return `https://www.strava.com/activities/${activityId}`
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'Yesterday'
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getWeekStart(date) {
  const d = new Date(date); const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0, 0, 0, 0); return d
}

function calcScore(sessions, dur) { return Math.round(sessions * 10 + (dur / 3600) * 5) }

function formatDist(m) { if (!m) return null; const km = m / 1000; return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(m)} m` }
function formatDur(s)  { if (!s) return null; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }
function formatElev(m) { if (!m) return null; return `↑ ${Math.round(m)} m` }
function formatSpeed(ms, type) {
  if (!ms) return null
  if (type === 'Swim') {
    const secPer100 = 100 / ms
    const m = Math.floor(secPer100 / 60)
    const s = Math.round(secPer100 % 60)
    return `${m}:${String(s).padStart(2, '0')}/100m`
  }
  if (['Run','VirtualRun','TrailRun'].includes(type)) {
    const secPerKm = 1000 / ms
    const m = Math.floor(secPerKm / 60)
    const s = Math.round(secPerKm % 60)
    return `${m}:${String(s).padStart(2, '0')}/km`
  }
  return `${(ms * 3.6).toFixed(1)} km/h`
}
function formatWatts(w) { if (!w) return null; return `${Math.round(w)}w` }
function formatCadence(c, type) { if (!c) return null; return ['Run','VirtualRun','TrailRun'].includes(type) ? `${Math.round(c * 2)} spm` : `${Math.round(c)} rpm` }

// ── Error boundary ────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <div style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
        <div style={{ background: 'rgba(255,61,139,0.1)', border: '1px solid rgba(255,61,139,0.2)', borderRadius: 8, padding: '1.5rem', color: '#FF3D8B' }}>
          <b>Training page error</b><br />{this.state.err.message}
        </div>
      </div>
    )
    return this.props.children
  }
}

// ── Avatar ────────────────────────────────────────────────────────
function Av({ name, color, url, size = 26 }) {
  const init = (name || 'A').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color || '#00C4B4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontSize: Math.max(9, size * 0.36), fontWeight: 700, color: '#000', flexShrink: 0 }}>{init}</div>
}

// ── Weekly summary ────────────────────────────────────────────────
function WeeklySummary({ activities }) {
  const ws = getWeekStart(new Date())
  const week = activities.filter(a => new Date(a.start_date) >= ws)
  const sw = week.filter(a => ['Swim'].includes(a.sport_type))
  const bk = week.filter(a => ['Bike', 'Ride', 'VirtualRide'].includes(a.sport_type))
  const rn = week.filter(a => ['Run', 'VirtualRun'].includes(a.sport_type))
  const swKm = sw.reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const bkKm = bk.reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const rnKm = rn.reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const cols = [
    { e: '🏅', l: 'Sessions', v: week.length,                                        s: 'this week',                                        c: '#fff'    },
    { e: '🏊', l: 'Swim',     v: swKm > 0 ? `${swKm.toFixed(1)} km` : sw.length,    s: `${sw.length} session${sw.length !== 1 ? 's' : ''}`, c: '#00C4B4' },
    { e: '🚴', l: 'Bike',     v: bkKm > 0 ? `${bkKm.toFixed(0)} km` : bk.length,    s: `${bk.length} session${bk.length !== 1 ? 's' : ''}`, c: '#FF5A1F' },
    { e: '🏃', l: 'Run',      v: rnKm > 0 ? `${rnKm.toFixed(1)} km` : rn.length,    s: `${rn.length} session${rn.length !== 1 ? 's' : ''}`, c: '#FF3D8B' },
  ]
  return (
    <div style={{ background: 'rgba(252,76,2,0.06)', border: '1px solid rgba(252,76,2,0.18)', borderTop: '2px solid #FC4C02', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '2.5px', textTransform: 'uppercase', color: STRAVA_ORANGE, marginBottom: 10 }}>This Week — Team Training</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {cols.map(c => (
          <div key={c.l}>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 3, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '1px', textTransform: 'uppercase' }}>{c.e} {c.l}</div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, fontWeight: 700, color: (c.v === 0) ? '#333' : c.c, lineHeight: 1 }}>{c.v}</div>
            <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>{c.s}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────
function Leaderboard({ activities, profiles }) {
  const ws = getWeekStart(new Date())
  const week = activities.filter(a => new Date(a.start_date) >= ws)
  const map = {}
  week.forEach(a => {
    if (!map[a.athlete_id]) {
      const p = profiles[a.athlete_id] || {}
      map[a.athlete_id] = { id: a.athlete_id, name: p.full_name || 'Athlete', color: p.avatar_color, url: p.avatar_url, sessions: 0, dur: 0 }
    }
    map[a.athlete_id].sessions++
    map[a.athlete_id].dur += a.moving_time || 0
  })
  const ranked = Object.values(map).map(a => ({ ...a, score: calcScore(a.sessions, a.dur) })).sort((a, b) => b.score - a.score)
  const MEDALS = ['🥇', '🥈', '🥉']
  return (
    <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', color: '#555' }}>This Week</div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 700, color: '#fff' }}>Leaderboard</div>
      </div>
      {ranked.length === 0
        ? <div style={{ padding: '12px 14px', fontSize: 12, color: '#444', fontStyle: 'italic' }}>No training logged yet this week</div>
        : ranked.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: i < ranked.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i === 0 ? 'rgba(232,184,75,0.04)' : 'none' }}>
            <span style={{ fontSize: 14, width: 18, flexShrink: 0 }}>{MEDALS[i] || `${i + 1}`}</span>
            <Av name={a.name} color={a.color} url={a.url} size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
              <div style={{ fontSize: 10, color: '#555' }}>{a.sessions} session{a.sessions !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 700, color: i === 0 ? '#E8B84B' : '#666', flexShrink: 0 }}>{a.score}</div>
          </div>
        ))
      }
      <div style={{ padding: '4px 14px 7px', fontSize: 10, color: '#333', fontFamily: 'Barlow Condensed, sans-serif' }}>Sessions × 10 + hours × 5</div>
    </div>
  )
}

// ── Streaks ───────────────────────────────────────────────────────
// Reads training_streak_current directly from profiles — computed by
// strava-sync.js bootstrap/incremental logic, not derived from the feed.
function Streaks({ profiles }) {
  const athletes = Object.values(profiles)
    .filter(p => p.strava_athlete_id) // only connected athletes
    .map(p => ({
      id:       p.id,
      name:     p.full_name || 'Athlete',
      color:    p.avatar_color,
      url:      p.avatar_url,
      streak:   p.training_streak_current || 0,
      longest:  p.training_streak_longest || 0,
      pending:  p.strava_bootstrap_status !== 'complete',
    }))
    .filter(a => a.streak > 0 || a.pending)
    .sort((a, b) => b.streak - a.streak)

  return (
    <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', color: '#555' }}>Consistency</div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 700, color: '#fff' }}>Weekly Streaks</div>
      </div>
      {athletes.length === 0
        ? <div style={{ padding: '12px 14px', fontSize: 12, color: '#444', fontStyle: 'italic' }}>No active streaks yet</div>
        : athletes.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: i < athletes.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <Av name={a.name} color={a.color} url={a.url} size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
              {a.pending
                ? <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>Calculating streak...</div>
                : <div style={{ fontSize: 10, color: '#555' }}>{a.streak} week{a.streak !== 1 ? 's' : ''} straight</div>
              }
            </div>
            {a.pending
              ? <div style={{ fontSize: 11, color: '#444', fontFamily: 'Barlow Condensed, sans-serif' }}>–</div>
              : <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, color: '#FF5A1F', flexShrink: 0 }}>{'🔥'.repeat(Math.min(a.streak, 3))} {a.streak}</div>
            }
          </div>
        ))
      }
    </div>
  )
}

// ── Peak week ─────────────────────────────────────────────────────
function PeakWeek({ activities, athleteId }) {
  const mine = activities.filter(a => a.athlete_id === athleteId)
  const weeks = {}
  mine.forEach(a => {
    const ws = getWeekStart(new Date(a.start_date)).getTime()
    if (!weeks[ws]) weeks[ws] = { sessions: 0, dur: 0, dist: 0 }
    weeks[ws].sessions++
    weeks[ws].dur  += a.moving_time || 0
    weeks[ws].dist += a.distance    || 0
  })
  const entries = Object.entries(weeks)
  if (entries.length < 2) return null
  const thisW  = getWeekStart(new Date()).getTime()
  const scored = entries.map(([ts, w]) => ({ ts: +ts, score: calcScore(w.sessions, w.dur), ...w }))
  const peak   = scored.reduce((b, w) => w.score > b.score ? w : b, scored[0])
  if (peak.ts !== thisW) return null
  return (
    <div style={{ background: 'rgba(232,184,75,0.08)', border: '1px solid rgba(232,184,75,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>🏆</span>
      <div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, color: '#E8B84B' }}>Biggest week in the last 14 days!</div>
        <div style={{ fontSize: 11, color: '#aaa' }}>{peak.sessions} sessions · {(peak.dur / 3600).toFixed(1)}h · {(peak.dist / 1000).toFixed(0)} km</div>
      </div>
    </div>
  )
}

// ── Monthly summary ───────────────────────────────────────────────
function MonthlySummary({ activities }) {
  const now = new Date()
  if (now.getDate() > 7) return null
  const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const acts = activities.filter(a => { const d = new Date(a.start_date); return d.getMonth() === lm && d.getFullYear() === ly })
  if (!acts.length) return null
  const swKm = acts.filter(a => a.sport_type === 'Swim').reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const bkKm = acts.filter(a => ['Bike','Ride','VirtualRide'].includes(a.sport_type)).reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const rnKm = acts.filter(a => ['Run','VirtualRun'].includes(a.sport_type)).reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const hrs  = acts.reduce((s, a) => s + (a.moving_time || 0), 0) / 3600
  const aths = new Set(acts.map(a => a.athlete_id)).size
  const stats = [
    swKm > 0 && { emoji: '🏊', label: 'Swim',  value: `${swKm.toFixed(1)} km`, color: '#00C4B4' },
    bkKm > 0 && { emoji: '🚴', label: 'Bike',  value: `${bkKm.toFixed(0)} km`,  color: '#FF5A1F' },
    rnKm > 0 && { emoji: '🏃', label: 'Run',   value: `${rnKm.toFixed(1)} km`, color: '#FF3D8B' },
               { emoji: '⏱',  label: 'Total', value: `${hrs.toFixed(0)}h`,     color: '#E8B84B' },
  ].filter(Boolean)
  return (
    <div style={{ background: 'rgba(255,61,139,0.06)', border: '1px solid rgba(255,61,139,0.18)', borderRadius: 10, padding: '0.875rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: '#FF3D8B', marginBottom: 2 }}>🗓 {MONTHS[lm]} Recap</div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, color: '#fff' }}>{acts.length} sessions · {aths} athlete{aths !== 1 ? 's' : ''}</div>
      </div>
      <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch', flexShrink: 0 }} />
      {stats.map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>{s.emoji}</span>
          <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</span>
          <span style={{ fontSize: 11, color: '#555' }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Activity badge strip ──────────────────────────────────────────
// Badges that can be attributed to a specific activity (shown on the card).
// These are computed client-side from the activity's own fields — the sync
// has already written them to profile_badges, this is just a visual hint.
const ACTIVITY_BADGE_CHECKS = [
  { key: 'century',       check: a => normaliseSportClient(a.sport_type) === 'ride' && (a.distance || 0) / 1000 >= 160 },
  { key: 'marathon_legs', check: a => normaliseSportClient(a.sport_type) === 'run'  && (a.distance || 0) / 1000 >= 42.2 },
  { key: 'iron_swim',     check: a => normaliseSportClient(a.sport_type) === 'swim' && (a.distance || 0) / 1000 >= 3.8 },
  { key: 'suffer_200',    check: a => (a.suffer_score || 0) >= 200 },
]

const ACTIVITY_BADGE_LABELS = {
  century:       { icon: '💯', label: 'The Century' },
  marathon_legs: { icon: '🦵', label: 'Marathon Legs' },
  iron_swim:     { icon: '🌊', label: 'Iron Swimmer' },
  suffer_200:    { icon: '😤', label: 'Pain Cave' },
}

function normaliseSportClient(sportType) {
  const s = (sportType || '').toLowerCase()
  if (s.includes('swim'))                                                     return 'swim'
  if (s.includes('ride') || s.includes('cycling') || s.includes('virtual'))  return 'ride'
  if (s.includes('run'))                                                      return 'run'
  return s
}

function ActivityBadgeStrip({ activity }) {
  const triggered = ACTIVITY_BADGE_CHECKS.filter(b => b.check(activity))
  if (!triggered.length) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
      {triggered.map(b => {
        const meta = ACTIVITY_BADGE_LABELS[b.key]
        return (
          <span
            key={b.key}
            title={meta.label}
            style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 3,
              background: 'rgba(232,184,75,0.1)',
              border: '1px solid rgba(232,184,75,0.25)',
              color: '#E8B84B',
              fontFamily: 'Barlow Condensed, sans-serif',
              letterSpacing: '0.5px',
            }}
          >
            {meta.icon} {meta.label}
          </span>
        )
      })}
    </div>
  )
}

// ── Activity card ─────────────────────────────────────────────────
function ActivityCard({ activity, upcomingRaces }) {
  const cfg     = getType(activity.sport_type)
  const myRaces = upcomingRaces.filter(r => r.athlete_id === activity.athlete_id)
  const nextRace = myRaces[0]
  const daysOut  = nextRace ? Math.ceil((new Date(nextRace.race_date) - new Date()) / 86400000) : null
  return (
    <a href={stravaUrl(activity.id)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', marginBottom: 8 }}>
      <div
        style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,76,2,0.3)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Av name={activity.athlete_name} color={activity.athlete_avatar_color} url={activity.athlete_avatar_url} size={20} />
          <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 12, color: '#888', flex: 1 }}>{activity.athlete_name}</span>
          {nextRace && daysOut !== null && daysOut <= 30 && (
            <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, color: '#00C4B4', background: 'rgba(0,196,180,0.1)', border: '1px solid rgba(0,196,180,0.2)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
              🏁 {daysOut}d · {nextRace.name.replace(/ironman\s+70\.3\s+/i, '').replace(/ironman\s+/i, '')}
            </span>
          )}
          <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{timeAgo(activity.start_date)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{cfg.emoji}</div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{activity.name}</div>
          <span style={{ fontSize: 10, color: STRAVA_ORANGE, flexShrink: 0 }}>View →</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {activity.distance             > 0 && <span style={{ fontSize: 12, color: cfg.color, fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif' }}>{formatDist(activity.distance)}</span>}
          {activity.moving_time          > 0 && <span style={{ fontSize: 12, color: '#888' }}>{formatDur(activity.moving_time)}</span>}
          {activity.total_elevation_gain > 0 && <span style={{ fontSize: 12, color: '#666' }}>{formatElev(activity.total_elevation_gain)}</span>}
          {activity.average_speed        > 0 && <span style={{ fontSize: 12, color: '#666' }}>{formatSpeed(activity.average_speed, activity.sport_type)}</span>}
          {activity.average_watts        > 0 && <span style={{ fontSize: 12, color: '#a78bfa' }}>{formatWatts(activity.average_watts)}</span>}
          {activity.weighted_average_watts > 0 && <span style={{ fontSize: 12, color: '#7c6fcd' }}>NP {formatWatts(activity.weighted_average_watts)}</span>}
          {activity.average_cadence      > 0 && <span style={{ fontSize: 12, color: '#666' }}>{formatCadence(activity.average_cadence, activity.sport_type)}</span>}
          {activity.average_heartrate    > 0 && <span style={{ fontSize: 12, color: '#888' }}>♥ {Math.round(activity.average_heartrate)} bpm</span>}
          {activity.suffer_score         > 0 && <span style={{ fontSize: 12, color: '#555' }}>effort {activity.suffer_score}</span>}
          {activity.pr_count             > 0 && <span style={{ fontSize: 11, color: '#E8B84B', background: 'rgba(232,184,75,0.1)', borderRadius: 3, padding: '1px 5px' }}>🏆 {activity.pr_count} PR{activity.pr_count > 1 ? 's' : ''}</span>}
          {activity.kudos_count          > 0 && <span style={{ fontSize: 12, color: '#555' }}>👍 {activity.kudos_count}</span>}
          {activity.trainer                  && <span style={{ fontSize: 11, color: '#444', background: 'rgba(255,255,255,0.04)', borderRadius: 3, padding: '1px 5px' }}>indoor</span>}
        </div>
        <ActivityBadgeStrip activity={activity} />
      </div>
    </a>
  )
}

// ── Connect banner ────────────────────────────────────────────────
function ConnectBanner({ userId }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `https://www.strava.com/oauth/authorize?client_id=${import.meta.env.VITE_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(origin + '/api/strava/callback')}&response_type=code&approval_prompt=auto&scope=activity:read&state=${userId}`
  return (
    <div style={{ background: 'rgba(252,76,2,0.07)', border: '1px solid rgba(252,76,2,0.2)', borderRadius: 10, padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
      <div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Connect your Strava</div>
        <div style={{ fontSize: 13, color: '#999' }}>Share your training and appear on the leaderboard.</div>
      </div>
      <a href={url} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STRAVA_ORANGE, color: '#fff', textDecoration: 'none', fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', padding: '9px 18px', borderRadius: 6, flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
        Connect Strava
      </a>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
function TrainingPage({ session, profile }) {
  const [activities, setActivities]         = useState([])
  const [profiles, setProfiles]             = useState({})   // map of id → profile
  const [upcomingRaces, setUpcomingRaces]   = useState([])
  const [challenges, setChallenges]         = useState([])
  const [showChallengeModal, setShowChallengeModal] = useState(false)
  const [syncing, setSyncing]               = useState(false)
  const [lastSync, setLastSync]             = useState(null)
  const [loading, setLoading]               = useState(true)
  const [searchParams]                      = useSearchParams()

  const userId      = session?.user?.id
  const isConnected = !!profile?.strava_athlete_id

  useEffect(() => { loadAll() }, [])

  // Poll for bootstrap completion if any athlete is still pending
  useEffect(() => {
    const hasPending = Object.values(profiles).some(p => p.strava_bootstrap_status !== 'complete' && p.strava_athlete_id)
    if (!hasPending) return
    const interval = setInterval(() => loadProfiles(), 30000) // check every 30s
    return () => clearInterval(interval)
  }, [profiles])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadActivities(), loadProfiles(), loadRaces(), loadChallenge()])
    setLoading(false)
  }

  async function loadActivities() {
    // Match sync.js retention: back to 1st of previous month
    const now = new Date()
    const cutoffYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const cutoffMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    const cutoff = new Date(Date.UTC(cutoffYear, cutoffMonth, 1)).toISOString()
    const { data } = await supabase
      .from('strava_activities')
      .select('id, athlete_id, name, sport_type, start_date, start_date_local, distance, moving_time, elapsed_time, total_elevation_gain, average_heartrate, max_heartrate, map_summary_polyline, kudos_count, achievement_count, average_speed, max_speed, average_cadence, average_watts, max_watts, weighted_average_watts, kilojoules, suffer_score, pr_count, trainer, commute, synced_at, created_at')
      .gte('start_date', cutoff)
      .order('start_date', { ascending: false })
      .limit(500)
    if (data) {
      setActivities(data)
      if (data.length > 0) setLastSync(data[0].start_date)
    }
  }

  async function loadProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select(`
        id, full_name, avatar_color, avatar_url,
        strava_athlete_id,
        strava_bootstrap_status,
        training_streak_current,
        training_streak_longest,
        training_streak_last_active
      `)
      .not('strava_athlete_id', 'is', null)
    if (data) {
      const map = {}
      data.forEach(p => { map[p.id] = p })
      setProfiles(map)
    }
  }

  async function loadRaces() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('race_entries')
      .select('athlete_id, races(id, name, race_date, type)')
      .gte('races.race_date', today)
    if (data) setUpcomingRaces(
      data.filter(e => e.races)
        .map(e => ({ athlete_id: e.athlete_id, ...e.races }))
        .sort((a, b) => new Date(a.race_date) - new Date(b.race_date))
    )
  }

  async function loadChallenge() {
    const { data } = await supabase
      .from('challenges')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    setChallenges(data || [])
  }

  async function handleRefresh() {
    if (!isConnected || syncing) return
    setSyncing(true)
    try {
      const res = await fetch('/api/strava/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) {
        await loadAll()
      }
    } catch (e) { console.error(e) }
    setSyncing(false)
  }

  // Enrich activities with profile data
  const enriched = activities.map(a => ({
    ...a,
    athlete_name:         profiles[a.athlete_id]?.full_name     || 'Athlete',
    athlete_avatar_color: profiles[a.athlete_id]?.avatar_color,
    athlete_avatar_url:   profiles[a.athlete_id]?.avatar_url,
  }))

  const connectedCount = Object.keys(profiles).length

  const grouped = enriched.reduce((acc, act) => {
    const key = new Date(act.start_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    if (!acc[key]) acc[key] = []
    acc[key].push(act)
    return acc
  }, {})

  const firstDayAthletes = Object.values(grouped)[0]
    ? [...new Set(Object.values(grouped)[0].map(a => a.athlete_id))]
    : []

  function latestActivityLabel(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now - d) / 86400000)
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const dateStr2 = diffDays === 0 ? `today at ${time}`
      : diffDays === 1 ? `yesterday at ${time}`
      : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
    return `latest activity ${dateStr2}`
  }
  const syncLabel = latestActivityLabel(lastSync)

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <style>{`
        @media (min-width: 768px) {
          .train-grid { display: grid; grid-template-columns: 1fr 256px; gap: 1.25rem; align-items: start; }
          .train-sidebar { position: sticky; top: 68px; }
        }
        @media (max-width: 767px) {
          .train-grid { display: flex; flex-direction: column; gap: 0; }
          .train-sidebar { order: -1; margin-bottom: 1rem; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 32, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: 2 }}>Training</div>
          <div style={{ fontSize: 13, color: '#999' }}>
            {connectedCount > 0 ? `${connectedCount} teammate${connectedCount !== 1 ? 's' : ''} connected via Strava` : 'Connect Strava to share your training'}
            {syncLabel ? ` · ${syncLabel}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {isConnected && (
            <button onClick={handleRefresh} disabled={syncing} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', padding: '7px 12px', background: syncing ? 'rgba(252,76,2,0.1)' : 'none', border: '1px solid rgba(252,76,2,0.3)', borderRadius: 4, color: STRAVA_ORANGE, cursor: syncing ? 'not-allowed' : 'pointer' }}>
              {syncing ? 'Syncing...' : '↻ Refresh'}
            </button>
          )}
        </div>
      </div>

      {!isConnected && <ConnectBanner userId={userId} />}

      {searchParams.get('connected') === 'true' && (
        <div style={{ background: 'rgba(0,196,180,0.1)', border: '1px solid rgba(0,196,180,0.25)', borderRadius: 8, padding: '10px 14px', color: '#00C4B4', fontSize: 13, marginBottom: '1.25rem' }}>
          ✓ Strava connected! Your activities will appear within the hour. Hit Refresh to sync your recent activities now.
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Barlow Condensed', letterSpacing: 2, color: '#555', textTransform: 'uppercase', fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          <MonthlySummary activities={enriched} />
          <WeeklySummary activities={enriched} />

          {challenges.map(ch => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              isAdmin={profile?.role === 'admin'}
              onManage={() => setShowChallengeModal(true)}
            />
          ))}
          <div className="train-grid">
            {/* Feed */}
            <div style={{ minWidth: 0 }}>
              {profile?.role === 'admin' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                  <button
                    onClick={() => setShowChallengeModal(true)}
                    style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', padding: '5px 12px', background: 'rgba(232,184,75,0.08)', border: '1px solid rgba(232,184,75,0.25)', borderRadius: 4, color: '#E8B84B', cursor: 'pointer' }}
                  >
                    + Add challenge
                  </button>
                </div>
              )}
              {enriched.length === 0 ? (
                <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '3rem 2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏊🚴🏃</div>
                  <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 18, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: 6 }}>No activities yet</div>
                  <div style={{ fontSize: 13, color: '#999' }}>
                    {connectedCount === 0
                      ? 'Connect your Strava above to get started.'
                      : isConnected
                        ? 'Hit Refresh to sync your latest activities.'
                        : 'No activities in the last 14 days.'}
                  </div>
                </div>
              ) : (
                Object.entries(grouped).map(([day, acts], dayIdx) => (
                  <div key={day} style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: '#444', marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{day}</div>
                    {dayIdx === 0 && firstDayAthletes.map(id => (
                      <PeakWeek key={id} activities={enriched} athleteId={id} />
                    ))}
                    {acts.map(act => <ActivityCard key={act.id} activity={act} upcomingRaces={upcomingRaces} />)}
                  </div>
                ))
              )}
            </div>

            {/* Sidebar */}
            <div className="train-sidebar">
              <Leaderboard activities={enriched} profiles={profiles} />
              <Streaks profiles={profiles} />
            </div>
          </div>
        </>
      )}

      {showChallengeModal && profile?.role === 'admin' && (
        <ChallengeAdminModal
          challenge={null}
          userId={userId}
          onSave={() => { setShowChallengeModal(false); loadChallenge() }}
          onClose={() => setShowChallengeModal(false)}
        />
      )}
    </div>
  )
}

export default function Training(props) {
  return <ErrorBoundary><TrainingPage {...props} /></ErrorBoundary>
}
