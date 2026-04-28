import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STRAVA_ORANGE = '#FC4C02'

const TYPE_CONFIG = {
  'Swim':     { emoji: '🏊', color: '#00C4B4', bg: 'rgba(0,196,180,0.1)' },
  'Bike':     { emoji: '🚴', color: '#FF5A1F', bg: 'rgba(255,90,31,0.1)' },
  'Run':      { emoji: '🏃', color: '#FF3D8B', bg: 'rgba(255,61,139,0.1)' },
  'Walk':     { emoji: '🚶', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  'Hike':     { emoji: '🥾', color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  'Strength': { emoji: '💪', color: '#E8B84B', bg: 'rgba(232,184,75,0.1)' },
  'Workout':  { emoji: '⚡', color: '#E8B84B', bg: 'rgba(232,184,75,0.1)' },
}

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || { emoji: '🏅', color: '#999', bg: 'rgba(255,255,255,0.05)' }
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'Yesterday'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Get the Monday of the week containing a date
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function isSameWeek(dateA, dateB) {
  return getWeekStart(dateA).getTime() === getWeekStart(dateB).getTime()
}

// Combined score: sessions × 10 + hours × 5
function calcScore(sessions, durationSeconds) {
  return Math.round(sessions * 10 + (durationSeconds / 3600) * 5)
}

function Avatar({ name, avatarColor, avatarUrl, size = 28 }) {
  const initials = (name || 'A').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const color = avatarColor || '#00C4B4'
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontSize: size * 0.38, fontWeight: 700, color: '#000', flexShrink: 0 }}>{initials}</div>
}

// ── SIDEBAR: Weekly Leaderboard ──────────────────────────────────
function WeeklyLeaderboard({ activities }) {
  const weekStart = getWeekStart(new Date())
  const thisWeek = activities.filter(a => new Date(a.start_date) >= weekStart)

  // Group by athlete
  const athletes = {}
  thisWeek.forEach(act => {
    if (!athletes[act.athlete_id]) {
      athletes[act.athlete_id] = {
        id: act.athlete_id, name: act.athlete_name,
        avatarColor: act.athlete_avatar_color, avatarUrl: act.athlete_avatar_url,
        sessions: 0, durationS: 0, distanceM: 0,
      }
    }
    athletes[act.athlete_id].sessions++
    athletes[act.athlete_id].durationS += act.duration_s || 0
    athletes[act.athlete_id].distanceM += act.distance_m || 0
  })

  const ranked = Object.values(athletes)
    .map(a => ({ ...a, score: calcScore(a.sessions, a.durationS) }))
    .sort((a, b) => b.score - a.score)

  const MEDALS = ['🥇', '🥈', '🥉']

  return (
    <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#555' }}>This Week</div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, color: '#fff' }}>Leaderboard</div>
      </div>
      {ranked.length === 0 ? (
        <div style={{ padding: '16px 14px', fontSize: '12px', color: '#555', fontStyle: 'italic' }}>No training logged yet this week</div>
      ) : (
        ranked.map((athlete, idx) => (
          <div key={athlete.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderBottom: idx < ranked.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: idx === 0 ? 'rgba(232,184,75,0.04)' : 'none' }}>
            <span style={{ fontSize: '16px', flexShrink: 0, width: '20px' }}>{MEDALS[idx] || `${idx + 1}`}</span>
            <Avatar name={athlete.name} avatarColor={athlete.avatarColor} avatarUrl={athlete.avatarUrl} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{athlete.name}</div>
              <div style={{ fontSize: '11px', color: '#555' }}>{athlete.sessions} session{athlete.sessions !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, color: idx === 0 ? '#E8B84B' : '#999', flexShrink: 0 }}>
              {athlete.score}
            </div>
          </div>
        ))
      )}
      <div style={{ padding: '6px 14px 8px', fontSize: '10px', color: '#333', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.5px' }}>
        Score = sessions × 10 + hours × 5
      </div>
    </div>
  )
}

// ── SIDEBAR: Training Streaks ────────────────────────────────────
function TrainingStreaks({ activities }) {
  // Group activities by athlete and week
  const athleteWeeks = {}
  activities.forEach(act => {
    const key = act.athlete_id
    if (!athleteWeeks[key]) {
      athleteWeeks[key] = {
        id: act.athlete_id, name: act.athlete_name,
        avatarColor: act.athlete_avatar_color, avatarUrl: act.athlete_avatar_url,
        weeks: new Set(),
      }
    }
    athleteWeeks[key].weeks.add(getWeekStart(new Date(act.start_date)).getTime())
  })

  // Calculate streak: consecutive weeks ending this week or last week
  const streaks = Object.values(athleteWeeks).map(athlete => {
    const sortedWeeks = [...athlete.weeks].sort((a, b) => b - a)
    const thisWeek = getWeekStart(new Date()).getTime()
    const lastWeek = thisWeek - 7 * 24 * 60 * 60 * 1000

    // Streak must include this week or last week to be active
    if (!sortedWeeks.includes(thisWeek) && !sortedWeeks.includes(lastWeek)) {
      return { ...athlete, streak: 0 }
    }

    let streak = 0
    let expected = sortedWeeks.includes(thisWeek) ? thisWeek : lastWeek

    for (const week of sortedWeeks) {
      if (week === expected) {
        streak++
        expected -= 7 * 24 * 60 * 60 * 1000
      } else break
    }

    return { ...athlete, streak }
  }).filter(a => a.streak > 0).sort((a, b) => b.streak - a.streak)

  return (
    <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#555' }}>Consistency</div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, color: '#fff' }}>Weekly Streaks</div>
      </div>
      {streaks.length === 0 ? (
        <div style={{ padding: '16px 14px', fontSize: '12px', color: '#555', fontStyle: 'italic' }}>No active streaks yet</div>
      ) : (
        streaks.map((athlete, idx) => (
          <div key={athlete.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderBottom: idx < streaks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <Avatar name={athlete.name} avatarColor={athlete.avatarColor} avatarUrl={athlete.avatarUrl} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{athlete.name}</div>
              <div style={{ fontSize: '11px', color: '#555' }}>{athlete.streak} week{athlete.streak !== 1 ? 's' : ''} straight</div>
            </div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '18px', fontWeight: 700, color: '#FF5A1F', flexShrink: 0 }}>
              {'🔥'.repeat(Math.min(athlete.streak, 3))} {athlete.streak}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── INLINE: Race Countdown Block ─────────────────────────────────
function RaceCountdown({ upcomingRaces, athleteId, athleteName }) {
  const myRaces = upcomingRaces.filter(r => r.athlete_id === athleteId)
  if (myRaces.length === 0) return null
  const nextRace = myRaces[0]
  const daysOut = Math.ceil((new Date(nextRace.race_date) - new Date()) / 86400000)

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0,196,180,0.08) 0%, rgba(0,0,0,0) 70%)',
      border: '1px solid rgba(0,196,180,0.2)',
      borderRadius: '8px', padding: '10px 14px',
      marginBottom: '8px', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    }}>
      <div>
        <div style={{ fontSize: '11px', color: '#00C4B4', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>🏁 Next Race</div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', fontWeight: 600, color: '#fff' }}>{nextRace.name}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '28px', fontWeight: 800, color: '#00C4B4', lineHeight: 1 }}>{daysOut}</div>
        <div style={{ fontSize: '11px', color: '#555' }}>days to go</div>
      </div>
    </div>
  )
}

// ── INLINE: Peak Week Callout ────────────────────────────────────
function PeakWeekCallout({ activities, athleteId }) {
  // Group this athlete's activities by week
  const weeks = {}
  activities.filter(a => a.athlete_id === athleteId).forEach(act => {
    const ws = getWeekStart(new Date(act.start_date)).getTime()
    if (!weeks[ws]) weeks[ws] = { sessions: 0, durationS: 0, distanceM: 0 }
    weeks[ws].sessions++
    weeks[ws].durationS += act.duration_s || 0
    weeks[ws].distanceM += act.distance_m || 0
  })

  const weekEntries = Object.entries(weeks)
  if (weekEntries.length < 3) return null // need enough history to be meaningful

  const thisWeekTs = getWeekStart(new Date()).getTime()
  const scores = weekEntries.map(([ts, w]) => ({ ts: parseInt(ts), score: calcScore(w.sessions, w.durationS), ...w }))
  const peak = scores.reduce((best, w) => w.score > best.score ? w : best, scores[0])

  // Only show if this week IS the peak week (celebrating in real time)
  if (peak.ts !== thisWeekTs) return null

  const hours = (peak.durationS / 3600).toFixed(1)

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(232,184,75,0.12) 0%, rgba(0,0,0,0) 70%)',
      border: '1px solid rgba(232,184,75,0.3)',
      borderRadius: '8px', padding: '10px 14px',
      marginBottom: '8px', display: 'flex',
      alignItems: 'center', gap: '12px',
    }}>
      <div style={{ fontSize: '28px' }}>🏆</div>
      <div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 700, color: '#E8B84B', marginBottom: '2px' }}>Biggest week of the last 90 days!</div>
        <div style={{ fontSize: '12px', color: '#aaa' }}>{peak.sessions} sessions · {hours}h training · {(peak.distanceM / 1000).toFixed(0)} km</div>
      </div>
    </div>
  )
}

// ── INLINE: Monthly Team Summary ─────────────────────────────────
function MonthlyTeamSummary({ activities }) {
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

  // Only show at the start of the month (first 7 days) as a recap of last month
  if (now.getDate() > 7) return null

  const lastMonthActs = activities.filter(a => {
    const d = new Date(a.start_date)
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
  })

  if (lastMonthActs.length === 0) return null

  const totalSwimKm = lastMonthActs.filter(a => a.type === 'Swim').reduce((s, a) => s + (a.distance_m || 0), 0) / 1000
  const totalBikeKm = lastMonthActs.filter(a => a.type === 'Bike').reduce((s, a) => s + (a.distance_m || 0), 0) / 1000
  const totalRunKm = lastMonthActs.filter(a => a.type === 'Run').reduce((s, a) => s + (a.distance_m || 0), 0) / 1000
  const totalHours = lastMonthActs.reduce((s, a) => s + (a.duration_s || 0), 0) / 3600
  const athletes = new Set(lastMonthActs.map(a => a.athlete_id)).size

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255,61,139,0.08) 0%, rgba(0,0,0,0) 70%)',
      border: '1px solid rgba(255,61,139,0.2)',
      borderRadius: '10px', padding: '1.25rem 1.5rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', color: '#FF3D8B', marginBottom: '8px' }}>
        🗓 {MONTH_NAMES[lastMonth]} Team Recap
      </div>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>
        Team TTL logged {lastMonthActs.length} sessions across {athletes} athlete{athletes !== 1 ? 's' : ''} last month 🤘
      </div>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {totalSwimKm > 0 && <div><div style={{ fontSize: '11px', color: '#555' }}>🏊 Swim</div><div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, color: '#00C4B4' }}>{totalSwimKm.toFixed(1)} km</div></div>}
        {totalBikeKm > 0 && <div><div style={{ fontSize: '11px', color: '#555' }}>🚴 Bike</div><div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, color: '#FF5A1F' }}>{totalBikeKm.toFixed(0)} km</div></div>}
        {totalRunKm > 0 && <div><div style={{ fontSize: '11px', color: '#555' }}>🏃 Run</div><div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, color: '#FF3D8B' }}>{totalRunKm.toFixed(1)} km</div></div>}
        <div><div style={{ fontSize: '11px', color: '#555' }}>⏱ Total</div><div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, color: '#E8B84B' }}>{totalHours.toFixed(0)}h</div></div>
      </div>
    </div>
  )
}

// ── Weekly summary bar ────────────────────────────────────────────
function WeeklySummary({ activities }) {
  const weekStart = getWeekStart(new Date())
  const thisWeek = activities.filter(a => new Date(a.start_date) >= weekStart)
  const swims = thisWeek.filter(a => a.type === 'Swim')
  const bikes = thisWeek.filter(a => a.type === 'Bike')
  const runs = thisWeek.filter(a => a.type === 'Run')
  const totalSwimKm = swims.reduce((s, a) => s + (a.distance_m || 0), 0) / 1000
  const totalBikeKm = bikes.reduce((s, a) => s + (a.distance_m || 0), 0) / 1000
  const totalRunKm = runs.reduce((s, a) => s + (a.distance_m || 0), 0) / 1000

  const stats = [
    { label: 'Sessions', value: thisWeek.length, sub: 'this week', color: '#fff' },
    { label: 'Swim', value: totalSwimKm > 0 ? `${totalSwimKm.toFixed(1)} km` : '—', sub: `${swims.length} session${swims.length !== 1 ? 's' : ''}`, color: '#00C4B4', emoji: '🏊' },
    { label: 'Bike', value: totalBikeKm > 0 ? `${totalBikeKm.toFixed(0)} km` : '—', sub: `${bikes.length} session${bikes.length !== 1 ? 's' : ''}`, color: '#FF5A1F', emoji: '🚴' },
    { label: 'Run', value: totalRunKm > 0 ? `${totalRunKm.toFixed(1)} km` : '—', sub: `${runs.length} session${runs.length !== 1 ? 's' : ''}`, color: '#FF3D8B', emoji: '🏃' },
  ]

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(252,76,2,0.08) 0%, rgba(0,0,0,0) 60%)', border: '1px solid rgba(252,76,2,0.2)', borderRadius: '12px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #FC4C02, #FF3D8B)' }} />
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: STRAVA_ORANGE, marginBottom: '1rem' }}>This Week — Team Training</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {stats.map(stat => (
          <div key={stat.label}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>{stat.emoji} {stat.label}</div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '26px', fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{stat.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Activity Card ─────────────────────────────────────────────────
function ActivityCard({ activity }) {
  const cfg = getTypeConfig(activity.type)
  return (
    <a href={activity.strava_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
      <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'border-color 0.15s', cursor: 'pointer', marginBottom: '8px' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(252,76,2,0.3)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
      >
        {/* Top row: icon + name + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>{cfg.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <Avatar name={activity.athlete_name} avatarColor={activity.athlete_avatar_color} avatarUrl={activity.athlete_avatar_url} size={16} />
              <span style={{ fontSize: '12px', color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.athlete_name}</span>
            </div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '15px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.name}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '11px', color: '#555' }}>{timeAgo(activity.start_date)}</div>
            <div style={{ fontSize: '10px', color: STRAVA_ORANGE, marginTop: '2px' }}>View →</div>
          </div>
        </div>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingLeft: '46px' }}>
          {activity.distance && <span style={{ fontSize: '13px', color: cfg.color, fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif' }}>{activity.distance}</span>}
          {activity.duration && <span style={{ fontSize: '13px', color: '#999' }}>{activity.duration}</span>}
          {activity.elevation && <span style={{ fontSize: '13px', color: '#555' }}>↑ {activity.elevation}</span>}
          {activity.average_heartrate && <span style={{ fontSize: '13px', color: '#555' }}>♥ {activity.average_heartrate} bpm</span>}
          {activity.kudos > 0 && <span style={{ fontSize: '13px', color: '#555' }}>👍 {activity.kudos}</span>}
        </div>
      </div>
    </a>
  )
}

// ── Connect Banner ────────────────────────────────────────────────
function ConnectBanner({ userId }) {
  const connectUrl = `https://www.strava.com/oauth/authorize?client_id=${import.meta.env.VITE_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + '/api/strava/callback')}&response_type=code&approval_prompt=auto&scope=activity:read&state=${userId}`
  return (
    <div style={{ background: 'rgba(252,76,2,0.08)', border: '1px solid rgba(252,76,2,0.2)', borderRadius: '10px', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      <div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '3px' }}>Connect your Strava</div>
        <div style={{ fontSize: '13px', color: '#999' }}>Share your training with the team and appear on the leaderboard.</div>
      </div>
      <a href={connectUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: STRAVA_ORANGE, color: '#fff', textDecoration: 'none', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 20px', borderRadius: '6px', flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
        Connect Strava
      </a>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────
export default function Training({ session, profile }) {
  const [activities, setActivities] = useState([])
  const [upcomingRaces, setUpcomingRaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connectedCount, setConnectedCount] = useState(0)
  const [disconnecting, setDisconnecting] = useState(false)
  const [searchParams] = useSearchParams()
  const isMobile = window.innerWidth < 768
  const isConnected = !!profile?.strava_athlete_id

  useEffect(() => {
    loadActivities()
    loadUpcomingRaces()
  }, [])

  async function loadActivities() {
    setLoading(true)
    try {
      const res = await fetch('/api/strava/activities')
      if (!res.ok) throw new Error('Failed to load activities')
      const data = await res.json()
      setActivities(data.activities || [])
      setConnectedCount(data.connectedCount || 0)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function loadUpcomingRaces() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('race_entries')
      .select('athlete_id, races(id, name, race_date, type)')
      .gte('races.race_date', today)
      .order('races(race_date)')
    if (data) {
      setUpcomingRaces(data.filter(e => e.races).map(e => ({ athlete_id: e.athlete_id, ...e.races })))
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Strava? Your activities will no longer appear in the team feed.')) return
    setDisconnecting(true)
    await fetch('/api/strava/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
    window.location.reload()
  }

  // Only show last 14 days in feed
  const feedActivities = activities.filter(a => new Date(a.start_date) >= new Date(Date.now() - 14 * 24 * 60 * 60 * 1000))

  // Group feed by day
  const grouped = feedActivities.reduce((acc, act) => {
    const d = new Date(act.start_date)
    const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    if (!acc[key]) acc[key] = []
    acc[key].push(act)
    return acc
  }, {})

  // Get unique athletes in feed for per-athlete callouts
  const feedAthletes = [...new Set(feedActivities.map(a => a.athlete_id))]

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '36px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: '4px' }}>Training</div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            {connectedCount > 0 ? `${connectedCount} teammate${connectedCount !== 1 ? 's' : ''} connected via Strava` : 'Connect Strava to share your training with the team'}
          </div>
        </div>
        {isConnected && (
          <button onClick={handleDisconnect} disabled={disconnecting} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', padding: '8px 14px', background: 'none', border: '1px solid rgba(252,76,2,0.3)', borderRadius: '4px', color: STRAVA_ORANGE, cursor: 'pointer' }}>
            {disconnecting ? 'Disconnecting...' : 'Disconnect Strava'}
          </button>
        )}
      </div>

      {!isConnected && <ConnectBanner userId={userId} />}

      {searchParams.get('connected') === 'true' && (
        <div style={{ background: 'rgba(0,196,180,0.1)', border: '1px solid rgba(0,196,180,0.25)', borderRadius: '8px', padding: '12px 16px', color: '#00C4B4', fontSize: '14px', marginBottom: '1.5rem' }}>
          ✓ Strava connected! Your activities will now appear in the team feed.
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Barlow Condensed', letterSpacing: 2, color: '#555', textTransform: 'uppercase' }}>Loading...</div>
      ) : error ? (
        <div style={{ background: 'rgba(255,61,139,0.1)', border: '1px solid rgba(255,61,139,0.2)', borderRadius: '8px', padding: '1rem', color: '#FF3D8B', fontSize: '14px' }}>
          Failed to load activities — {error}
        </div>
      ) : (
        <>
          {/* Monthly recap — only shows first 7 days of month */}
          <MonthlyTeamSummary activities={activities} />

          {/* Weekly summary bar */}
          <WeeklySummary activities={feedActivities} />

          {/* Main layout: feed + sidebar */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: '1.5rem', alignItems: 'start' }}>

            {/* Left: activity feed */}
            <div style={{ minWidth: 0 }}>
              {feedActivities.length === 0 ? (
                <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏊🚴🏃</div>
                  <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: '8px' }}>No activities yet</div>
                  <div style={{ fontSize: '14px', color: '#999' }}>
                    {connectedCount === 0 ? 'Connect your Strava above to get started.' : 'No activities in the last 14 days. Get training! 💪'}
                  </div>
                </div>
              ) : (
                Object.entries(grouped).map(([day, dayActivities]) => {
                  // For each day, check if any athletes have peak week or race countdown
                  const dayAthletes = [...new Set(dayActivities.map(a => a.athlete_id))]
                  return (
                    <div key={day} style={{ marginBottom: '1.5rem' }}>
                      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', color: '#444', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{day}</div>

                      {/* Per-athlete callouts for this day's first appearance */}
                      {dayAthletes.map(athleteId => {
                        const act = dayActivities.find(a => a.athlete_id === athleteId)
                        const isFirstAppearanceToday = feedActivities.findIndex(a => a.athlete_id === athleteId) === feedActivities.indexOf(dayActivities[0])
                        return (
                          <div key={athleteId}>
                            <PeakWeekCallout activities={activities} athleteId={athleteId} />
                            <RaceCountdown upcomingRaces={upcomingRaces} athleteId={athleteId} athleteName={act?.athlete_name} />
                          </div>
                        )
                      })}

                      {dayActivities.map(act => <ActivityCard key={act.id} activity={act} />)}
                    </div>
                  )
                })
              )}
            </div>

            {/* Right: sidebar — shows above feed on mobile */}
            <div style={{ position: isMobile ? 'static' : 'sticky', top: '72px', order: isMobile ? -1 : 0 }}>
              <WeeklyLeaderboard activities={activities} />
              <TrainingStreaks activities={activities} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
