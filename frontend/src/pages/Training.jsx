import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STRAVA_ORANGE = '#FC4C02'

// Activity type icons and colours
const TYPE_CONFIG = {
  'Swim': { emoji: '🏊', color: '#00C4B4', bg: 'rgba(0,196,180,0.1)' },
  'Bike': { emoji: '🚴', color: '#FF5A1F', bg: 'rgba(255,90,31,0.1)' },
  'Run':  { emoji: '🏃', color: '#FF3D8B', bg: 'rgba(255,61,139,0.1)' },
  'Walk': { emoji: '🚶', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  'Hike': { emoji: '🥾', color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  'Strength': { emoji: '💪', color: '#E8B84B', bg: 'rgba(232,184,75,0.1)' },
  'Workout': { emoji: '⚡', color: '#E8B84B', bg: 'rgba(232,184,75,0.1)' },
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

function Avatar({ profile, size = 28 }) {
  const name = profile?.athlete_name || 'Athlete'
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const color = profile?.athlete_avatar_color || '#00C4B4'
  if (profile?.athlete_avatar_url) {
    return <img src={profile.athlete_avatar_url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontSize: size * 0.38, fontWeight: 700, color: '#000', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

function WeeklySummary({ activities }) {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thisWeek = activities.filter(a => new Date(a.start_date) >= oneWeekAgo)

  const swims = thisWeek.filter(a => a.type === 'Swim')
  const bikes = thisWeek.filter(a => a.type === 'Bike')
  const runs = thisWeek.filter(a => a.type === 'Run')

  const totalSwimKm = swims.reduce((s, a) => s + (a.distance_m || 0), 0) / 1000
  const totalBikeKm = bikes.reduce((s, a) => s + (a.distance_m || 0), 0) / 1000
  const totalRunKm = runs.reduce((s, a) => s + (a.distance_m || 0), 0) / 1000
  const totalSessions = thisWeek.length

  const stats = [
    { label: 'Sessions', value: totalSessions, sub: 'this week', color: '#fff' },
    { label: 'Swim', value: totalSwimKm > 0 ? `${totalSwimKm.toFixed(1)} km` : '—', sub: `${swims.length} session${swims.length !== 1 ? 's' : ''}`, color: '#00C4B4', emoji: '🏊' },
    { label: 'Bike', value: totalBikeKm > 0 ? `${totalBikeKm.toFixed(0)} km` : '—', sub: `${bikes.length} session${bikes.length !== 1 ? 's' : ''}`, color: '#FF5A1F', emoji: '🚴' },
    { label: 'Run', value: totalRunKm > 0 ? `${totalRunKm.toFixed(1)} km` : '—', sub: `${runs.length} session${runs.length !== 1 ? 's' : ''}`, color: '#FF3D8B', emoji: '🏃' },
  ]

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(252,76,2,0.08) 0%, rgba(0,0,0,0) 60%)',
      border: '1px solid rgba(252,76,2,0.2)',
      borderRadius: '12px', padding: '1.5rem',
      marginBottom: '1.5rem', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #FC4C02, #FF3D8B)' }} />
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: STRAVA_ORANGE, marginBottom: '1rem' }}>
        This Week — Team Training
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {stats.map(stat => (
          <div key={stat.label}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>
              {stat.emoji} {stat.label}
            </div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '28px', fontWeight: 700, color: stat.color, lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{stat.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityCard({ activity }) {
  const cfg = getTypeConfig(activity.type)
  return (
    <a href={activity.strava_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#161616', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px', padding: '1rem 1.25rem',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center', gap: '12px',
        transition: 'border-color 0.15s, background 0.15s',
        cursor: 'pointer', marginBottom: '8px',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(252,76,2,0.3)'; e.currentTarget.style.background = '#1a1a1a' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = '#161616' }}
      >
        {/* Type icon */}
        <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
          {cfg.emoji}
        </div>

        {/* Activity info */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <Avatar profile={activity} size={20} />
            <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', color: '#999' }}>{activity.athlete_name}</span>
          </div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' }}>
            {activity.name}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {activity.distance && (
              <span style={{ fontSize: '12px', color: cfg.color, fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif' }}>{activity.distance}</span>
            )}
            {activity.duration && (
              <span style={{ fontSize: '12px', color: '#999' }}>{activity.duration}</span>
            )}
            {activity.elevation && (
              <span style={{ fontSize: '12px', color: '#555' }}>↑ {activity.elevation}</span>
            )}
            {activity.average_heartrate && (
              <span style={{ fontSize: '12px', color: '#555' }}>♥ {activity.average_heartrate} bpm</span>
            )}
          </div>
        </div>

        {/* Right — time + kudos */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: '#555', marginBottom: '4px' }}>{timeAgo(activity.start_date)}</div>
          {activity.kudos > 0 && (
            <div style={{ fontSize: '11px', color: '#555' }}>👍 {activity.kudos}</div>
          )}
          <div style={{ fontSize: '10px', color: STRAVA_ORANGE, marginTop: '4px', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.5px' }}>View →</div>
        </div>
      </div>
    </a>
  )
}

function ConnectBanner({ userId }) {
  const connectUrl = `https://www.strava.com/oauth/authorize?client_id=${import.meta.env.VITE_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin + '/api/strava/callback')}&response_type=code&approval_prompt=auto&scope=activity:read&state=${userId}`

  return (
    <div style={{
      background: 'rgba(252,76,2,0.08)', border: '1px solid rgba(252,76,2,0.2)',
      borderRadius: '10px', padding: '1.25rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem',
    }}>
      <div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '3px' }}>
          Connect your Strava
        </div>
        <div style={{ fontSize: '13px', color: '#999' }}>
          Share your training with the team. Your activities will appear in the feed.
        </div>
      </div>
      <a href={connectUrl} style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        background: STRAVA_ORANGE, color: '#fff', textDecoration: 'none',
        fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px',
        fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase',
        padding: '10px 20px', borderRadius: '6px', flexShrink: 0,
        transition: 'opacity 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
        Connect Strava
      </a>
    </div>
  )
}

export default function Training({ session, profile }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connectedCount, setConnectedCount] = useState(0)
  const [disconnecting, setDisconnecting] = useState(false)
  const [searchParams] = useSearchParams()
  const userId = session.user.id
  const isConnected = !!profile?.strava_athlete_id

  useEffect(() => {
    loadActivities()
    // Show success toast if just connected
    if (searchParams.get('connected') === 'true') {
      setError(null)
    }
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

  async function handleDisconnect() {
    if (!confirm('Disconnect Strava? Your activities will no longer appear in the team feed.')) return
    setDisconnecting(true)
    await fetch('/api/strava/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    // Reload page to reflect disconnected state
    window.location.reload()
  }

  // Group activities by day
  const grouped = activities.reduce((acc, act) => {
    const d = new Date(act.start_date)
    const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    if (!acc[key]) acc[key] = []
    acc[key].push(act)
    return acc
  }, {})

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '36px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: '4px' }}>
            Training
          </div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            {connectedCount > 0 ? `${connectedCount} teammate${connectedCount !== 1 ? 's' : ''} connected via Strava · Last 14 days` : 'Connect Strava to share your training with the team'}
          </div>
        </div>
        {isConnected && (
          <button onClick={handleDisconnect} disabled={disconnecting} style={{
            fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '1px',
            textTransform: 'uppercase', padding: '8px 14px', background: 'none',
            border: '1px solid rgba(252,76,2,0.3)', borderRadius: '4px',
            color: STRAVA_ORANGE, cursor: 'pointer', flexShrink: 0,
          }}>
            {disconnecting ? 'Disconnecting...' : 'Disconnect Strava'}
          </button>
        )}
      </div>

      {/* Connect banner — show if not connected */}
      {!isConnected && <ConnectBanner userId={userId} />}

      {/* Success message */}
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
      ) : activities.length === 0 ? (
        <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏊🚴🏃</div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: '8px' }}>
            No activities yet
          </div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            {connectedCount === 0
              ? 'Connect your Strava above to get started.'
              : 'No activities in the last 14 days. Get training! 💪'}
          </div>
        </div>
      ) : (
        <>
          <WeeklySummary activities={activities} />

          {Object.entries(grouped).map(([day, dayActivities]) => (
            <div key={day} style={{ marginBottom: '1.5rem' }}>
              <div style={{
                fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px',
                letterSpacing: '2px', textTransform: 'uppercase', color: '#444',
                marginBottom: '8px', paddingBottom: '6px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                {day}
              </div>
              {dayActivities.map(act => <ActivityCard key={act.id} activity={act} />)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
