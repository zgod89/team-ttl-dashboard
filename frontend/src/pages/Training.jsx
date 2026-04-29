import { useState, useEffect, Component } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STRAVA_ORANGE = '#FC4C02'

const TYPE_CONFIG = {
  'Swim':     { emoji: '🏊', color: '#00C4B4', bg: 'rgba(0,196,180,0.12)' },
  'Bike':     { emoji: '🚴', color: '#FF5A1F', bg: 'rgba(255,90,31,0.12)' },
  'Run':      { emoji: '🏃', color: '#FF3D8B', bg: 'rgba(255,61,139,0.12)' },
  'Walk':     { emoji: '🚶', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  'Hike':     { emoji: '🥾', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  'Strength': { emoji: '💪', color: '#E8B84B', bg: 'rgba(232,184,75,0.12)' },
  'Workout':  { emoji: '⚡', color: '#E8B84B', bg: 'rgba(232,184,75,0.12)' },
}

function getType(type) { return TYPE_CONFIG[type] || { emoji: '🏅', color: '#aaa', bg: 'rgba(255,255,255,0.06)' } }

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'Yesterday'
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getWeekStart(date) {
  const d = new Date(date); const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0,0,0,0); return d
}

function calcScore(sessions, dur) { return Math.round(sessions * 10 + (dur / 3600) * 5) }

function formatDist(m) { if (!m) return null; const km = m / 1000; return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(m)} m` }
function formatDur(s)  { if (!s) return null; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }
function formatElev(m) { if (!m) return null; return `↑ ${Math.round(m)} m` }
function formatSpeed(ms, type) {
  if (!ms) return null
  if (type === 'Swim') {
    // ms = m/s → seconds per 100m → MM:SS /100m
    const secPer100 = 100 / ms
    const m = Math.floor(secPer100 / 60)
    const s = Math.round(secPer100 % 60)
    return `${m}:${String(s).padStart(2, '0')}/100m`
  }
  if (type === 'Run') {
    const secPerKm = 1000 / ms
    const m = Math.floor(secPerKm / 60)
    const s = Math.round(secPerKm % 60)
    return `${m}:${String(s).padStart(2, '0')}/km`
  }
  return `${(ms * 3.6).toFixed(1)} km/h`
}
function formatWatts(w) { if (!w) return null; return `${Math.round(w)}w` }
function formatCadence(c, type) { if (!c) return null; return type === 'Run' ? `${Math.round(c * 2)} spm` : `${Math.round(c)} rpm` }

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
  const sw = week.filter(a => a.type === 'Swim'), bk = week.filter(a => a.type === 'Bike'), rn = week.filter(a => a.type === 'Run')
  const swKm = sw.reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const bkKm = bk.reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const rnKm = rn.reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const cols = [
    { e: '🏅', l: 'Sessions', v: week.length,                              s: 'this week', c: '#fff' },
    { e: '🏊', l: 'Swim',     v: swKm > 0 ? `${swKm.toFixed(1)} km` : sw.length, s: `${sw.length} session${sw.length !== 1 ? 's' : ''}`, c: '#00C4B4' },
    { e: '🚴', l: 'Bike',     v: bkKm > 0 ? `${bkKm.toFixed(0)} km` : bk.length, s: `${bk.length} session${bk.length !== 1 ? 's' : ''}`, c: '#FF5A1F' },
    { e: '🏃', l: 'Run',      v: rnKm > 0 ? `${rnKm.toFixed(1)} km` : rn.length,  s: `${rn.length} session${rn.length !== 1 ? 's' : ''}`,  c: '#FF3D8B' },
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
function Streaks({ activities, profiles }) {
  const map = {}
  activities.forEach(a => {
    if (!map[a.athlete_id]) {
      const p = profiles[a.athlete_id] || {}
      map[a.athlete_id] = { id: a.athlete_id, name: p.full_name || 'Athlete', color: p.avatar_color, url: p.avatar_url, weeks: new Set() }
    }
    map[a.athlete_id].weeks.add(getWeekStart(new Date(a.start_date)).getTime())
  })
  const thisW = getWeekStart(new Date()).getTime()
  const lastW = thisW - 7 * 86400000
  const streaks = Object.values(map).map(athlete => {
    const sorted = [...athlete.weeks].sort((a, b) => b - a)
    if (!sorted.includes(thisW) && !sorted.includes(lastW)) return { ...athlete, streak: 0 }
    let streak = 0, exp = sorted.includes(thisW) ? thisW : lastW
    for (const w of sorted) { if (w === exp) { streak++; exp -= 7 * 86400000 } else break }
    return { ...athlete, streak }
  }).filter(a => a.streak > 0).sort((a, b) => b.streak - a.streak)

  return (
    <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', color: '#555' }}>Consistency</div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 700, color: '#fff' }}>Weekly Streaks</div>
      </div>
      {streaks.length === 0
        ? <div style={{ padding: '12px 14px', fontSize: 12, color: '#444', fontStyle: 'italic' }}>No active streaks yet</div>
        : streaks.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: i < streaks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <Av name={a.name} color={a.color} url={a.url} size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
              <div style={{ fontSize: 10, color: '#555' }}>{a.streak} week{a.streak !== 1 ? 's' : ''} straight</div>
            </div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, color: '#FF5A1F', flexShrink: 0 }}>{'🔥'.repeat(Math.min(a.streak, 3))} {a.streak}</div>
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
    weeks[ws].sessions++; weeks[ws].dur += a.moving_time || 0; weeks[ws].dist += a.distance || 0
  })
  const entries = Object.entries(weeks)
  if (entries.length < 3) return null
  const thisW = getWeekStart(new Date()).getTime()
  const scored = entries.map(([ts, w]) => ({ ts: +ts, score: calcScore(w.sessions, w.dur), ...w }))
  const peak = scored.reduce((b, w) => w.score > b.score ? w : b, scored[0])
  if (peak.ts !== thisW) return null
  return (
    <div style={{ background: 'rgba(232,184,75,0.08)', border: '1px solid rgba(232,184,75,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>🏆</span>
      <div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, color: '#E8B84B' }}>Biggest week of the last 90 days!</div>
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
  const swKm = acts.filter(a => a.type === 'Swim').reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const bkKm = acts.filter(a => a.type === 'Bike').reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const rnKm = acts.filter(a => a.type === 'Run').reduce((s, a) => s + (a.distance || 0), 0) / 1000
  const hrs  = acts.reduce((s, a) => s + (a.moving_time || 0), 0) / 3600
  const aths = new Set(acts.map(a => a.athlete_id)).size
  return (
    <div style={{ background: 'rgba(255,61,139,0.06)', border: '1px solid rgba(255,61,139,0.18)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: '#FF3D8B', marginBottom: 6 }}>🗓 {MONTHS[lm]} Team Recap</div>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 10 }}>{acts.length} sessions · {aths} athlete{aths !== 1 ? 's' : ''} 🤘</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {swKm > 0 && <div><div style={{ fontSize: 10, color: '#555' }}>🏊 Swim</div><div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 18, fontWeight: 700, color: '#00C4B4' }}>{swKm.toFixed(1)} km</div></div>}
        {bkKm > 0 && <div><div style={{ fontSize: 10, color: '#555' }}>🚴 Bike</div><div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 18, fontWeight: 700, color: '#FF5A1F' }}>{bkKm.toFixed(0)} km</div></div>}
        {rnKm > 0 && <div><div style={{ fontSize: 10, color: '#555' }}>🏃 Run</div><div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 18, fontWeight: 700, color: '#FF3D8B' }}>{rnKm.toFixed(1)} km</div></div>}
        <div><div style={{ fontSize: 10, color: '#555' }}>⏱ Total</div><div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 18, fontWeight: 700, color: '#E8B84B' }}>{hrs.toFixed(0)}h</div></div>
      </div>
    </div>
  )
}

// ── Activity card ─────────────────────────────────────────────────
function ActivityCard({ activity, upcomingRaces }) {
  const cfg = getType(activity.type)
  const myRaces = upcomingRaces.filter(r => r.athlete_id === activity.athlete_id)
  const nextRace = myRaces[0]
  const daysOut = nextRace ? Math.ceil((new Date(nextRace.race_date) - new Date()) / 86400000) : null
  return (
    <a href={activity.strava_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', marginBottom: 8 }}>
      <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, transition: 'border-color 0.15s' }}
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
          {activity.distance > 0 && <span style={{ fontSize: 12, color: cfg.color, fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif' }}>{formatDist(activity.distance)}</span>}
          {activity.moving_time > 0 && <span style={{ fontSize: 12, color: '#888' }}>{formatDur(activity.moving_time)}</span>}
          {activity.total_elevation_gain > 0 && <span style={{ fontSize: 12, color: '#666' }}>{formatElev(activity.total_elevation_gain)}</span>}
          {activity.average_speed > 0 && <span style={{ fontSize: 12, color: '#666' }}>{formatSpeed(activity.average_speed, activity.type)}</span>}
          {activity.average_watts > 0 && <span style={{ fontSize: 12, color: '#a78bfa' }}>{formatWatts(activity.average_watts)}</span>}
          {activity.weighted_average_watts > 0 && <span style={{ fontSize: 12, color: '#7c6fcd' }}>NP {formatWatts(activity.weighted_average_watts)}</span>}
          {activity.average_cadence > 0 && <span style={{ fontSize: 12, color: '#666' }}>{formatCadence(activity.average_cadence, activity.type)}</span>}
          {activity.average_heartrate > 0 && <span style={{ fontSize: 12, color: '#888' }}>♥ {Math.round(activity.average_heartrate)} bpm</span>}
          {activity.suffer_score > 0 && <span style={{ fontSize: 12, color: '#555' }}>effort {activity.suffer_score}</span>}
          {activity.pr_count > 0 && <span style={{ fontSize: 11, color: '#E8B84B', background: 'rgba(232,184,75,0.1)', borderRadius: 3, padding: '1px 5px' }}>🏆 {activity.pr_count} PR{activity.pr_count > 1 ? 's' : ''}</span>}
          {activity.kudos_count > 0 && <span style={{ fontSize: 12, color: '#555' }}>👍 {activity.kudos_count}</span>}
          {activity.trainer && <span style={{ fontSize: 11, color: '#444', background: 'rgba(255,255,255,0.04)', borderRadius: 3, padding: '1px 5px' }}>indoor</span>}
        </div>
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
  const [activities, setActivities]       = useState([])
  const [profiles, setProfiles]           = useState({})   // map of id → profile
  const [upcomingRaces, setUpcomingRaces] = useState([])
  const [syncing, setSyncing]             = useState(false)
  const [lastSync, setLastSync]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [searchParams]                    = useSearchParams()

  const userId      = session?.user?.id
  const isConnected = !!profile?.strava_athlete_id

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadActivities(), loadProfiles(), loadRaces()])
    setLoading(false)
  }

  async function loadActivities() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('strava_activities')
      .select('id, athlete_id, name, sport_type, start_date, start_date_local, distance, moving_time, elapsed_time, total_elevation_gain, average_heartrate, max_heartrate, map_summary_polyline, kudos_count, achievement_count, average_speed, max_speed, average_cadence, average_watts, max_watts, weighted_average_watts, kilojoules, suffer_score, pr_count, trainer, commute, gear_id, synced_at')
      .gte('start_date', cutoff)
      .order('start_date', { ascending: false })
      .limit(200)
    if (data) {
      setActivities(data)
      if (data.length > 0) setLastSync(data[0].synced_at)
    }
  }

  async function loadProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_color, avatar_url')
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

  async function handleRefresh() {
    if (!isConnected || syncing) return
    setSyncing(true)
    try {
      const res = await fetch('/api/strava/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (res.ok) {
        await loadActivities()
        setLastSync(new Date().toISOString())
      }
    } catch (e) { console.error(e) }
    setSyncing(false)
  }

  // Enrich activities with profile data
  function deriveType(sportType) {
    const map = { Swim: 'Swim', Ride: 'Bike', Run: 'Run', VirtualRide: 'Bike', VirtualRun: 'Run', TrailRun: 'Run', Walk: 'Walk', Hike: 'Hike', WeightTraining: 'Strength', Workout: 'Workout' }
    return map[sportType] || sportType || 'Workout'
  }
  const enriched = activities.map(a => ({
    ...a,
    type: deriveType(a.sport_type),
    strava_url: `https://www.strava.com/activities/${a.id}`,
    athlete_name: profiles[a.athlete_id]?.full_name || 'Athlete',
    athlete_avatar_color: profiles[a.athlete_id]?.avatar_color,
    athlete_avatar_url: profiles[a.athlete_id]?.avatar_url,
  }))

  const connectedCount = Object.keys(profiles).length

  // 14-day feed for display, 90-day for social features
  const feedCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const feedActivities = enriched.filter(a => new Date(a.start_date) >= feedCutoff)

  const grouped = feedActivities.reduce((acc, act) => {
    const key = new Date(act.start_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    if (!acc[key]) acc[key] = []
    acc[key].push(act)
    return acc
  }, {})

  const firstDayAthletes = Object.values(grouped)[0]
    ? [...new Set(Object.values(grouped)[0].map(a => a.athlete_id))]
    : []

  const syncAge = lastSync ? Math.floor((Date.now() - new Date(lastSync)) / 60000) : null
  const syncLabel = syncAge === null ? '' : syncAge < 60 ? `${syncAge}m ago` : `${Math.floor(syncAge / 60)}h ago`

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
            {syncLabel ? ` · synced ${syncLabel}` : ''}
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
          ✓ Strava connected! Your activities will sync automatically every 2 hours. Hit Refresh to sync now.
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Barlow Condensed', letterSpacing: 2, color: '#555', textTransform: 'uppercase', fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          <MonthlySummary activities={enriched} />
          <WeeklySummary activities={enriched} />

          <div className="train-grid">
            {/* Feed */}
            <div style={{ minWidth: 0 }}>
              {feedActivities.length === 0 ? (
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
              <Streaks activities={enriched} profiles={profiles} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Training(props) {
  return <ErrorBoundary><TrainingPage {...props} /></ErrorBoundary>
}
