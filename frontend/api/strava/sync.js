/**
 * Vercel Serverless Function — /api/strava/sync
 * Full-team Strava sync — called hourly by GitHub Actions
 *
 * GET /api/strava/sync
 * Header: Authorization: Bearer <CRON_SECRET>
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const STRAVA_API     = 'https://www.strava.com/api/v3'
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const CRON_SECRET    = process.env.CRON_SECRET

async function getValidToken(profile) {
  const now = Math.floor(Date.now() / 1000)
  if (profile.strava_token_expires_at > now + 60) return profile.strava_access_token

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: profile.strava_refresh_token,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  await supabase.from('profiles').update({
    strava_access_token:     data.access_token,
    strava_refresh_token:    data.refresh_token,
    strava_token_expires_at: data.expires_at,
  }).eq('id', profile.id)
  return data.access_token
}

async function syncAthlete(profile) {
  const token = await getValidToken(profile)
  if (!token) return { skipped: true }

  const cutoffTimestamp = Date.now() - NINETY_DAYS_MS
  let page = 1
  let allActivities = []

  while (true) {
    const actRes = await fetch(
      `${STRAVA_API}/athlete/activities?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!actRes.ok) break
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

  if (!allActivities.length) return { synced: 0 }

  const rows = allActivities.map(act => ({
    // --- Identity ---
    id:                    act.id,
    athlete_id:            profile.id,
    name:                  act.name || null,

    // --- Type ---
    sport_type:            act.sport_type || act.type || null,

    // --- Timing ---
    start_date:            act.start_date,
    start_date_local:      act.start_date_local || null,
    moving_time:           act.moving_time || null,
    elapsed_time:          act.elapsed_time || null,

    // --- Distance & elevation ---
    distance:              act.distance || null,
    total_elevation_gain:  act.total_elevation_gain || null,

    // --- Heart rate ---
    average_heartrate:     act.average_heartrate || null,
    max_heartrate:         act.max_heartrate || null,

    // --- Map ---
    map_summary_polyline:  act.map?.summary_polyline || null,

    // --- Extra fields (added via migration below) ---
    kudos_count:           act.kudos_count || 0,
    achievement_count:     act.achievement_count || 0,
    average_speed:         act.average_speed || null,
    max_speed:             act.max_speed || null,
    average_cadence:       act.average_cadence || null,
    average_watts:         act.average_watts || null,
    max_watts:             act.max_watts || null,
    weighted_average_watts: act.weighted_average_watts || null,
    kilojoules:            act.kilojoules || null,
    suffer_score:          act.suffer_score || null,
    pr_count:              act.pr_count || 0,
    trainer:               act.trainer || false,
    commute:               act.commute || false,
    gear_id:               act.gear_id || null,
    timezone:              act.timezone || null,
    synced_at:             new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('strava_activities')
    .upsert(rows, { onConflict: 'id' })

  if (error) return { error: error.message }
  return { synced: rows.length }
}

export default async function handler(req, res) {
  const auth = req.headers['authorization']
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const started = Date.now()
  const results = { synced: 0, skipped: 0, errors: [] }

  try {
    const { data: athletes, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, strava_athlete_id, strava_access_token, strava_refresh_token, strava_token_expires_at')
      .not('strava_athlete_id', 'is', null)
      .not('strava_refresh_token', 'is', null)

    if (profilesErr) throw new Error(`Failed to fetch profiles: ${profilesErr.message}`)
    if (!athletes?.length) return res.status(200).json({ message: 'No athletes connected', ...results })

    const CONCURRENCY = 3
    for (let i = 0; i < athletes.length; i += CONCURRENCY) {
      const batch = athletes.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(batch.map(a => syncAthlete(a)))
      batchResults.forEach((r, idx) => {
        if (r.skipped)    results.skipped++
        else if (r.error) results.errors.push({ athlete: batch[idx].full_name, error: r.error })
        else              results.synced += r.synced || 0
      })
    }

    // Prune activities older than 90 days
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS).toISOString()
    await supabase.from('strava_activities').delete().lt('start_date', cutoff)

  } catch (err) {
    console.error('[Strava Sync]', err.message)
    return res.status(500).json({ error: err.message, ...results })
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[Strava Sync] Done in ${elapsed}s — synced:${results.synced} skipped:${results.skipped} errors:${results.errors.length}`)
  return res.status(200).json({ elapsed: `${elapsed}s`, ...results })
}
