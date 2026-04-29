/**
 * Strava Activity Sync
 * Fetches recent activities for all connected athletes and upserts to Supabase.
 * Run via GitHub Actions cron every 2 hours.
 *
 * Usage:
 *   node strava-sync.js           -- syncs last 90 days for all athletes
 *   node strava-sync.js <userId>  -- syncs a specific user (manual refresh)
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const STRAVA_API = 'https://www.strava.com/api/v3'

// ── Token management ──────────────────────────────────────────────
async function getValidToken(profile) {
  const now = Math.floor(Date.now() / 1000)

  if (profile.strava_token_expires_at > now + 60) {
    return profile.strava_access_token
  }

  console.log(`[Strava] Refreshing token for ${profile.full_name}`)

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
    console.error(`[Strava] Token refresh failed for ${profile.full_name}: ${res.status}`)
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

// ── Activity formatting ───────────────────────────────────────────
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

// ── Sync one athlete ──────────────────────────────────────────────
async function syncAthlete(profile, days = 90) {
  const token = await getValidToken(profile)
  if (!token) {
    console.error(`[Strava] Skipping ${profile.full_name} — no valid token`)
    return 0
  }

  const after = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)

  // Paginate through all activities since cutoff
  let page = 1
  let allActivities = []
  while (true) {
    const res = await fetch(
      `${STRAVA_API}/athlete/activities?after=${after}&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!res.ok) {
      console.error(`[Strava] Failed to fetch activities for ${profile.full_name}: ${res.status}`)
      break
    }

    const batch = await res.json()
    if (!batch.length) break
    allActivities = allActivities.concat(batch)
    if (batch.length < 100) break // last page
    page++
    await new Promise(r => setTimeout(r, 500)) // rate limit buffer
  }

  if (!allActivities.length) {
    console.log(`[Strava] No activities found for ${profile.full_name}`)
    return 0
  }

  const rows = allActivities.map(act => ({
    id: act.id,
    athlete_id: profile.id,
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

  // Upsert in batches of 50
  const BATCH = 50
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('strava_activities')
      .upsert(batch, { onConflict: 'id' })
    if (error) console.error(`[Strava] Upsert error for ${profile.full_name}:`, error.message)
  }

  console.log(`[Strava] Synced ${rows.length} activities for ${profile.full_name}`)
  return rows.length
}

// ── Delete old activities (keep 90 days) ─────────────────────────
async function pruneOldActivities() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('strava_activities')
    .delete()
    .lt('start_date', cutoff)
  if (error) console.error('[Strava] Prune error:', error.message)
  else console.log('[Strava] Pruned activities older than 90 days')
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('=== Strava Sync ===', new Date().toISOString())

  const specificUserId = process.argv[2] // optional: sync just one user

  // Fetch connected profiles
  let query = supabase
    .from('profiles')
    .select('id, full_name, strava_athlete_id, strava_access_token, strava_refresh_token, strava_token_expires_at')
    .not('strava_athlete_id', 'is', null)

  if (specificUserId) {
    query = query.eq('id', specificUserId)
  }

  const { data: profiles, error } = await query

  if (error) {
    console.error('[Strava] Failed to load profiles:', error.message)
    process.exit(1)
  }

  if (!profiles?.length) {
    console.log('[Strava] No connected athletes found')
    return
  }

  console.log(`[Strava] Syncing ${profiles.length} athlete(s)...`)

  let total = 0
  for (const profile of profiles) {
    total += await syncAthlete(profile, specificUserId ? 90 : 90)
    // Rate limit: 100 requests per 15 min — add small delay between athletes
    if (profiles.length > 1) await new Promise(r => setTimeout(r, 1000))
  }

  // Prune old data on full sync (not single-user refresh)
  if (!specificUserId) await pruneOldActivities()

  console.log(`=== Strava Sync Complete — ${total} activities synced ===`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
