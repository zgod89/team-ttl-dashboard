import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const STRAVA_API = 'https://www.strava.com/api/v3'

async function getValidToken(profile) {
  const now = Math.floor(Date.now() / 1000)
  if (profile.strava_token_expires_at > now + 60) {
    return profile.strava_access_token
  }
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: profile.strava_refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    console.error(`[Strava] Token refresh failed for profile ${profile.id}`)
    return null
  }
  const data = await res.json()
  await supabase.from('profiles').update({
    strava_access_token: data.access_token,
    strava_refresh_token: data.refresh_token,
    strava_token_expires_at: data.expires_at,
  }).eq('id', profile.id)
  return data.access_token
}

function formatType(type) {
  const map = {
    'Swim': 'Swim', 'Ride': 'Bike', 'Run': 'Run',
    'VirtualRide': 'Bike', 'VirtualRun': 'Run',
    'TrailRun': 'Run', 'Walk': 'Walk', 'Hike': 'Hike',
    'WeightTraining': 'Strength', 'Workout': 'Workout',
    'Yoga': 'Yoga', 'Rowing': 'Row',
  }
  return map[type] || type
}

function formatDistance(metres) {
  if (!metres) return null
  const km = metres / 1000
  return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(metres)} m`
}

function formatDuration(seconds) {
  if (!seconds) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatElevation(metres) {
  if (!metres) return null
  return `${Math.round(metres)} m`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_color, avatar_url, strava_athlete_id, strava_access_token, strava_refresh_token, strava_token_expires_at')
      .not('strava_athlete_id', 'is', null)

    if (profileError) {
      return res.status(500).json({ error: 'Failed to load profiles' })
    }

    if (!profiles?.length) {
      return res.status(200).json({ activities: [], connectedCount: 0 })
    }

    const days = parseInt(req.query.days) || 90
    const after = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)
    const perPage = days <= 14 ? 30 : 100
    const allActivities = []

    await Promise.all(profiles.map(async (profile) => {
      const token = await getValidToken(profile)
      if (!token) return

      const actRes = await fetch(
        `${STRAVA_API}/athlete/activities?after=${after}&per_page=${perPage}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (!actRes.ok) {
        console.error(`[Strava] Failed to fetch for ${profile.full_name}: ${actRes.status}`)
        return
      }

      const activities = await actRes.json()
      activities.forEach(act => {
        allActivities.push({
          id: act.id,
          athlete_id: profile.id,
          athlete_name: profile.full_name,
          athlete_avatar_color: profile.avatar_color,
          athlete_avatar_url: profile.avatar_url,
          name: act.name,
          type: formatType(act.sport_type || act.type),
          raw_type: act.sport_type || act.type,
          distance: formatDistance(act.distance),
          distance_m: act.distance,
          duration: formatDuration(act.moving_time),
          duration_s: act.moving_time,
          elevation: formatElevation(act.total_elevation_gain),
          elevation_m: act.total_elevation_gain,
          start_date: act.start_date,
          strava_url: `https://www.strava.com/activities/${act.id}`,
          kudos: act.kudos_count,
          average_heartrate: act.average_heartrate ? Math.round(act.average_heartrate) : null,
          average_speed: act.average_speed,
        })
      })
    }))

    allActivities.sort((a, b) => new Date(b.start_date) - new Date(a.start_date))

    return res.status(200).json({
      activities: allActivities,
      connectedCount: profiles.length,
    })

  } catch (err) {
    console.error('[Strava] Unexpected error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
