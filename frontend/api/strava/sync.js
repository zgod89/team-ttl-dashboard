// frontend/api/strava/sync.js
// Vercel cron job — runs every hour via vercel.json
// Replicates the GitHub Actions strava-sync.js logic as a serverless function
//
// Setup:
//   1. Add to vercel.json:  { "crons": [{ "path": "/api/strava/sync", "schedule": "0 * * * *" }] }
//   2. Add CRON_SECRET to Vercel env vars (any random string, e.g. `openssl rand -hex 32`)
//   3. Vercel automatically sends Authorization: Bearer <CRON_SECRET> on cron invocations
//   4. Disable the schedule: block in .github/workflows/strava-sync.yml (keep workflow_dispatch)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const STRAVA_CLIENT_ID     = process.env.STRAVA_CLIENT_ID
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET
const CRON_SECRET          = process.env.CRON_SECRET

const NINETY_DAYS_SECS = 90 * 24 * 60 * 60

export default async function handler(req, res) {
  // ── Auth: only Vercel cron or manual calls with the secret may proceed ──
  const auth = req.headers['authorization']
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const results  = { synced: 0, skipped: 0, errors: [] }
  const started  = Date.now()

  try {
    // 1. Fetch all athletes with Strava connected
    const { data: athletes, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, strava_athlete_id, strava_access_token, strava_refresh_token, strava_token_expires_at')
      .not('strava_athlete_id', 'is', null)
      .not('strava_refresh_token', 'is', null)

    if (profilesErr) throw new Error(`Failed to fetch profiles: ${profilesErr.message}`)
    if (!athletes?.length) {
      return res.status(200).json({ message: 'No athletes connected', ...results })
    }

    // 2. Sync each athlete in parallel (with a concurrency cap to avoid rate limits)
    const CONCURRENCY = 3
    for (let i = 0; i < athletes.length; i += CONCURRENCY) {
      const batch = athletes.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(athlete => syncAthlete(athlete, supabase, results)))
    }

    // 3. Prune activities older than 90 days
    const cutoff = new Date(Date.now() - NINETY_DAYS_SECS * 1000).toISOString()
    const { error: pruneErr } = await supabase
      .from('strava_activities')
      .delete()
      .lt('start_date', cutoff)

    if (pruneErr) console.error('Prune error:', pruneErr.message)

  } catch (err) {
    console.error('Sync fatal error:', err.message)
    return res.status(500).json({ error: err.message, ...results })
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`Strava sync complete in ${elapsed}s — synced: ${results.synced}, skipped: ${results.skipped}, errors: ${results.errors.length}`)
  return res.status(200).json({ elapsed: `${elapsed}s`, ...results })
}

// ── Sync one athlete ──────────────────────────────────────────────

async function syncAthlete(athlete, supabase, results) {
  try {
    const accessToken = await getValidToken(athlete, supabase)
    if (!accessToken) { results.skipped++; return }

    // Fetch last 90 days of activities from Strava
    const after = Math.floor(Date.now() / 1000) - NINETY_DAYS_SECS
    const activities = await fetchAllActivities(accessToken, after)

    if (!activities.length) { results.skipped++; return }

    // Upsert into strava_activities
    const rows = activities.map(a => ({
      id:            String(a.id),
      athlete_id:    athlete.id,
      strava_id:     String(a.id),
      name:          a.name,
      type:          a.type,
      sport_type:    a.sport_type || a.type,
      start_date:    a.start_date,
      elapsed_time:  a.elapsed_time,
      moving_time:   a.moving_time,
      distance:      a.distance,
      total_elevation_gain: a.total_elevation_gain,
      average_speed: a.average_speed,
      max_speed:     a.max_speed,
      average_heartrate: a.average_heartrate || null,
      max_heartrate: a.max_heartrate || null,
      suffer_score:  a.suffer_score || null,
      kudos_count:   a.kudos_count || 0,
      map_polyline:  a.map?.summary_polyline || null,
      synced_at:     new Date().toISOString(),
    }))

    const { error: upsertErr } = await supabase
      .from('strava_activities')
      .upsert(rows, { onConflict: 'id' })

    if (upsertErr) {
      results.errors.push({ athlete: athlete.full_name, error: upsertErr.message })
    } else {
      results.synced++
    }

  } catch (err) {
    results.errors.push({ athlete: athlete.full_name, error: err.message })
  }
}

// ── Token refresh ─────────────────────────────────────────────────

async function getValidToken(athlete, supabase) {
  const expiresAt = athlete.strava_token_expires_at
    ? new Date(athlete.strava_token_expires_at).getTime()
    : 0

  // Token still valid (with 5 min buffer)
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    return athlete.strava_access_token
  }

  // Refresh the token
  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: athlete.strava_refresh_token,
    }),
  })

  if (!resp.ok) {
    console.error(`Token refresh failed for ${athlete.full_name}: ${resp.status}`)
    return null
  }

  const tokens = await resp.json()

  // Save refreshed tokens back to DB
  await supabase
    .from('profiles')
    .update({
      strava_access_token:    tokens.access_token,
      strava_refresh_token:   tokens.refresh_token,
      strava_token_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
    })
    .eq('id', athlete.id)

  return tokens.access_token
}

// ── Paginated activity fetch ──────────────────────────────────────

async function fetchAllActivities(accessToken, after) {
  const activities = []
  let page = 1

  while (true) {
    const resp = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!resp.ok) {
      // 429 = rate limited — stop gracefully
      if (resp.status === 429) console.warn('Strava rate limit hit, stopping pagination')
      break
    }

    const page_activities = await resp.json()
    if (!page_activities.length) break

    activities.push(...page_activities)
    if (page_activities.length < 100) break // last page
    page++
  }

  return activities
}
