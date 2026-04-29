/**
 * Vercel Serverless Function — /api/strava/refresh
 * Triggers an immediate Strava sync for the requesting user.
 * Called when user clicks "Refresh" on the Training page.
 *
 * POST /api/strava/refresh
 * Body: { userId: string }
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const STRAVA_API = 'https://www.strava.com/api/v3'

async function getValidToken(profile) {
  const now = Math.floor(Date.now() / 1000)
  if (profile.strava_token_expires_at > now + 60) return profile.strava_access_token

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
  if (!res.ok) return null
  const data = await res.json()
  await supabase.from('profiles').update({
    strava_access_token: data.access_token,
    strava_refresh_token: data.refresh_token,
    strava_token_expires_at: data.expires_at,
  }).eq('id', profile.id)
  return data.access_token
}

function formatType(type) {
  const map = { 'Swim': 'Swim', 'Ride': 'Bike', 'Run': 'Run', 'VirtualRide': 'Bike', 'VirtualRun': 'Run', 'TrailRun': 'Run', 'Walk': 'Walk', 'Hike': 'Hike', 'WeightTraining': 'Strength', 'Workout': 'Workout' }
  return map[type] || type
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, strava_athlete_id, strava_access_token, strava_refresh_token, strava_token_expires_at')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.strava_athlete_id) {
      return res.status(400).json({ error: 'No Strava connection found' })
    }

    const token = await getValidToken(profile)
    if (!token) return res.status(400).json({ error: 'Could not refresh Strava token' })

    const after = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000)
    const cutoffTimestamp = Date.now() - 90 * 24 * 60 * 60 * 1000
    let page = 1
    let allActivities = []
    while (true) {
      const actRes = await fetch(`${STRAVA_API}/athlete/activities?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!actRes.ok) return res.status(500).json({ error: `Strava API error: ${actRes.status}` })
      const batch = await actRes.json()
      if (!Array.isArray(batch) || !batch.length) break
      const withinWindow = batch.filter(a => new Date(a.start_date).getTime() >= cutoffTimestamp)
      allActivities = allActivities.concat(withinWindow)
      const oldest = batch[batch.length - 1]
      if (new Date(oldest.start_date).getTime() < cutoffTimestamp) break
      if (batch.length < 100) break
      page++
      await new Promise(r => setTimeout(r, 500))
    }

    const rows = allActivities.map(act => ({
      id: act.id,
      athlete_id: userId,
      name: act.name,
      type: formatType(act.sport_type || act.type),
      raw_type: act.sport_type || act.type,
      distance_m: act.distance || 0,
      duration_s: act.moving_time || 0,
      elevation_m: act.total_elevation_gain || 0,
      average_heartrate: act.average_heartrate ? Math.round(act.average_heartrate) : null,
      average_speed: act.average_speed || null,
      kudos: act.kudos_count || 0,
      start_date: act.start_date,
      strava_url: `https://www.strava.com/activities/${act.id}`,
      synced_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      const { error } = await supabase.from('strava_activities').upsert(rows, { onConflict: 'id' })
      if (error) return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ synced: rows.length })

  } catch (err) {
    console.error('[Strava Refresh]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
