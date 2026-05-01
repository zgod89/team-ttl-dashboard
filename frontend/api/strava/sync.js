/**
 * Vercel Serverless Function — /api/strava/sync
 * Full-team Strava sync — called hourly by GitHub Actions
 *
 * POST /api/strava/sync
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Per-athlete flow:
 *   Bootstrap (strava_bootstrap_status = 'pending')
 *     — Sets status to 'in_progress', walks full Strava history to find streak,
 *       stores activities back to the 1st of the prior month, then flips status to 'complete'.
 *       If rate-limited mid-walk, resets to 'pending' to retry next hour.
 *   Incremental (status = 'complete')
 *     — Fetches last 2 days (buffer prevents a missed run breaking a streak),
 *       upserts, prunes >14 days, increments running totals on profiles.
 *
 * After all athletes:
 *   — Badge conditions evaluated; newly earned badges inserted + celebrated
 *   — PR and achievement celebration messages posted to Training channel
 *   — Active weekly challenge progress recalculated
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role — bypasses RLS
)

const STRAVA_API       = 'https://www.strava.com/api/v3'
// Retention cutoff — always the 1st of the previous month.
// e.g. on 15 May → 1 Apr; on 3 Jan → 1 Dec (prev year).
// This ensures the full prior month is always available for the monthly recap.
function getRetentionCutoff() {
  const now = new Date()
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  return new Date(Date.UTC(year, month, 1))
}
const TWO_DAYS_S       = 2  * 24 * 60 * 60   // unix seconds — Strava `after` param
const CRON_SECRET      = process.env.CRON_SECRET

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

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
      .select(`
        id, full_name,
        strava_athlete_id, strava_access_token, strava_refresh_token, strava_token_expires_at,
        strava_bootstrap_status,
        training_streak_current, training_streak_longest,
        total_run_km, total_bike_km, total_swim_km, total_pr_count, total_kudos_received
      `)
      .not('strava_athlete_id', 'is', null)
      .not('strava_refresh_token', 'is', null)
      // Skip athletes currently mid-bootstrap to avoid concurrent double-processing
      .neq('strava_bootstrap_status', 'in_progress')

    if (profilesErr) throw new Error(`Failed to fetch profiles: ${profilesErr.message}`)
    if (!athletes?.length) return res.status(200).json({ message: 'No athletes connected', ...results })

    // Process in batches of 3 to avoid hammering Strava rate limits
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

    await updateChallengeProgress()

  } catch (err) {
    console.error('[Strava Sync]', err.message)
    return res.status(500).json({ error: err.message, ...results })
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[Strava Sync] Done in ${elapsed}s — synced:${results.synced} skipped:${results.skipped} errors:${results.errors.length}`)
  return res.status(200).json({ elapsed: `${elapsed}s`, ...results })
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-ATHLETE SYNC
// ─────────────────────────────────────────────────────────────────────────────

async function syncAthlete(profile) {
  const token = await getValidToken(profile)
  if (!token) return { skipped: true }

  if (profile.strava_bootstrap_status === 'pending') {
    return bootstrapAthlete(profile, token)
  }
  return incrementalSync(profile, token)
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
// Walk full history until a weekly gap appears, computing the correct streak.
// Only activities from the 1st of the prior month onward are written to strava_activities.
// Totals are computed from the full historical walk and written to profiles.

async function bootstrapAthlete(profile, token) {
  console.log(`[sync] Bootstrap starting for ${profile.full_name}`)

  // Mark in_progress so a concurrent run skips this athlete
  await supabase.from('profiles')
    .update({ strava_bootstrap_status: 'in_progress' })
    .eq('id', profile.id)

  let page = 1
  let allActivities = []
  let gapFound = false

  while (!gapFound) {
    let batch
    try {
      batch = await fetchStravaPage(token, { page, per_page: 50 })
    } catch (err) {
      if (err.rateLimited) {
        // Reset to pending — will retry on the next hourly run
        await supabase.from('profiles')
          .update({ strava_bootstrap_status: 'pending' })
          .eq('id', profile.id)
        console.warn(`[sync] Rate limited during bootstrap for ${profile.full_name} — will retry`)
        return { bootstrapping: true, rateLimit: true }
      }
      throw err
    }

    if (!batch.length) break
    allActivities = allActivities.concat(batch)
    gapFound = hasWeeklyGap(allActivities)
    if (batch.length < 50) break   // last page reached
    page++
    await sleep(300)
  }

  const streak  = computeWeeklyStreak(allActivities)
  const longest = Math.max(streak, profile.training_streak_longest || 0)
  const totals  = computeTotals(allActivities)

  // Only store back to start of previous month — covers monthly recap + 14-day feed
  const cutoff = getRetentionCutoff()
  const recentActivities = allActivities.filter(a => new Date(a.start_date) >= cutoff)

  await upsertActivities(profile.id, recentActivities)
  await pruneOldActivities(profile.id)

  await supabase.from('profiles').update({
    strava_bootstrap_status: 'complete',
    strava_last_synced_at:   new Date().toISOString(),
    training_streak_current: streak,
    training_streak_longest: longest,
    total_run_km:            totals.runKm,
    total_bike_km:           totals.bikeKm,
    total_swim_km:           totals.swimKm,
    total_pr_count:          totals.prCount,
    total_kudos_received:    totals.kudos,
  }).eq('id', profile.id)

  const updatedProfile = {
    ...profile,
    training_streak_current: streak,
    total_run_km:  totals.runKm,  total_bike_km: totals.bikeKm,
    total_swim_km: totals.swimKm, total_pr_count: totals.prCount,
    total_kudos_received: totals.kudos,
  }

  await checkAndAwardBadges(updatedProfile, recentActivities)
  // Intentionally no PR celebration on bootstrap — avoids flooding the Training
  // channel with every historical PR the athlete has ever set on Strava.

  console.log(`[sync] Bootstrap complete for ${profile.full_name} — streak: ${streak}, stored: ${recentActivities.length}`)
  return { bootstrapped: true, streak, synced: recentActivities.length }
}

// ── Incremental sync ─────────────────────────────────────────────────────────
// Fetch the last 2 days (2-day buffer means a single missed hourly run never
// breaks a streak), upsert, prune, increment running totals, recheck badges.

async function incrementalSync(profile, token) {
  const after = Math.floor(Date.now() / 1000) - TWO_DAYS_S
  const activities = await fetchStravaPage(token, { after, per_page: 100 })

  await upsertActivities(profile.id, activities)
  await pruneOldActivities(profile.id)

  // Increment totals by the newly synced activities only
  const delta = computeTotals(activities)
  const updatedProfile = await incrementTotals(profile, delta)

  // Recompute streak from the stored 14-day window (no Strava API call needed)
  const { data: window } = await supabase
    .from('strava_activities')
    .select('start_date')
    .eq('athlete_id', profile.id)

  const streak  = computeWeeklyStreak(window || [])
  const longest = Math.max(streak, updatedProfile.training_streak_longest || 0)

  await supabase.from('profiles').update({
    training_streak_current: streak,
    training_streak_longest: longest,
    strava_last_synced_at:   new Date().toISOString(),
  }).eq('id', profile.id)

  updatedProfile.training_streak_current = streak

  await checkAndAwardBadges(updatedProfile, activities)
  await celebratePRsAndAchievements(profile, activities)

  console.log(`[sync] Incremental for ${profile.full_name} — ${activities.length} activities, streak: ${streak}`)
  return { synced: activities.length, streak }
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE CHECKING
// ─────────────────────────────────────────────────────────────────────────────

async function checkAndAwardBadges(profile, recentActivities) {
  // Load already-earned badges so we never double-award
  const { data: earned } = await supabase
    .from('profile_badges')
    .select('badge_key')
    .eq('athlete_id', profile.id)

  const alreadyEarned = new Set((earned || []).map(r => r.badge_key))

  // Race entry count drives the race-based badges
  const { count: raceCount } = await supabase
    .from('race_entries')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', profile.id)

  const toAward = evaluateBadges(profile, recentActivities, raceCount || 0, alreadyEarned)

  for (const badgeKey of toAward) {
    const { error } = await supabase
      .from('profile_badges')
      .insert({ athlete_id: profile.id, badge_key: badgeKey })

    if (error) {
      // 23505 = unique violation — concurrent run beat us to it, safe to ignore
      if (error.code !== '23505') {
        console.error(`[badges] Insert error for ${badgeKey}:`, error.message)
      }
      continue
    }

    const label = BADGE_LABELS[badgeKey] || badgeKey
    await postToTrainingChannel(profile.id, `🎖️ ${profile.full_name} just earned **${label}**!`)
    console.log(`[badges] Awarded ${badgeKey} to ${profile.full_name}`)
  }
}

function evaluateBadges(profile, activities, raceCount, alreadyEarned) {
  const toAward = []
  const check = (key, condition) => {
    if (!alreadyEarned.has(key) && condition) toAward.push(key)
  }

  const streak = profile.training_streak_current || 0
  const runKm  = parseFloat(profile.total_run_km)  || 0
  const bikeKm = parseFloat(profile.total_bike_km) || 0
  const swimKm = parseFloat(profile.total_swim_km) || 0
  const prs    = profile.total_pr_count            || 0
  const kudos  = profile.total_kudos_received      || 0

  // ── Streak ────────────────────────────────────────────────────────────────
  check('streak_4',  streak >= 4)
  check('streak_8',  streak >= 8)
  check('streak_12', streak >= 12)
  check('streak_20', streak >= 20)
  check('streak_52', streak >= 52)

  // ── Cumulative PRs ────────────────────────────────────────────────────────
  check('pr_first', prs >= 1)
  check('pr_10',    prs >= 10)
  check('pr_50',    prs >= 50)
  check('pr_100',   prs >= 100)

  // ── Kudos ─────────────────────────────────────────────────────────────────
  check('kudos_100', kudos >= 100)
  check('kudos_500', kudos >= 500)

  // ── Distance totals ───────────────────────────────────────────────────────
  check('run_1000',   runKm  >= 1000)
  check('run_5000',   runKm  >= 5000)
  check('bike_10000', bikeKm >= 10000)
  check('bike_25000', bikeKm >= 25000)

  // ── Race entries ──────────────────────────────────────────────────────────
  check('race_first', raceCount >= 1)
  check('race_5',     raceCount >= 5)
  check('race_10',    raceCount >= 10)

  // ── Single-effort thresholds ──────────────────────────────────────────────
  for (const activity of activities) {
    const sport  = normaliseSport(activity.sport_type)
    const distKm = (activity.distance || 0) / 1000

    check('century',       sport === 'ride' && distKm >= 160)
    check('marathon_legs', sport === 'run'  && distKm >= 42.2)
    check('iron_swim',     sport === 'swim' && distKm >= 3.8)
    check('suffer_200',    (activity.suffer_score || 0) >= 200)
  }

  // ── Multi-sport combos and big day ────────────────────────────────────────
  const byDate = groupByDate(activities)
  for (const dayActivities of Object.values(byDate)) {
    const sports       = new Set(dayActivities.map(a => normaliseSport(a.sport_type)))
    const totalMoveSec = dayActivities.reduce((s, a) => s + (a.moving_time || 0), 0)

    check('triple_threat',  sports.has('swim') && sports.has('ride') && sports.has('run'))
    check('brick',          sports.has('ride') && sports.has('run'))
    check('shred_till_bed', totalMoveSec > 6 * 3600)
  }

  // ── Weekly volume ─────────────────────────────────────────────────────────
  const wk = currentWeekVolume(activities)
  check('half_iron_week', wk.swimKm >= 1.9  && wk.bikeKm >= 90  && wk.runKm >= 21)
  check('full_iron_week', wk.swimKm >= 3.8  && wk.bikeKm >= 180 && wk.runKm >= 42.2)

  return toAward
}

// Display names for celebration messages — mirrors the seed data in the migration
const BADGE_LABELS = {
  streak_4:       'On A Roll 🔥',
  streak_8:       'Locked In 🔒',
  streak_12:      'Unbreakable 💪',
  streak_20:      'Unstoppable 🚀',
  streak_52:      'Year of Graft 🏆',
  pr_first:       'Personal Best 🏅',
  pr_10:          'PR Machine ⚡',
  pr_50:          'Record Breaker 💥',
  pr_100:         'Relentless 🎯',
  triple_threat:  'Triple Threat 🔱',
  brick:          'Brick House 🧱',
  shred_till_bed: "Shred Til' Bed 🛏️",
  kudos_100:      'TTL Nash 👏',
  kudos_500:      'TTL Legend ⭐',
  run_1000:       '1,000km Runner 👟',
  run_5000:       'Ultra Runner 🏃',
  bike_10000:     '10,000km Rider 🚴',
  bike_25000:     'Velominati 🚵',
  race_first:     'Race Debut 🎽',
  race_5:         'Race Regular 📅',
  race_10:        'Race Addict 🗓️',
  century:        'The Century 💯',
  marathon_legs:  'Marathon Legs 🦵',
  iron_swim:      'Iron Swimmer 🌊',
  suffer_200:     'Pain Cave 😤',
  half_iron_week: '70.3 Ready 🔶',
  full_iron_week: 'Iron Ready 🔴',
}

// ─────────────────────────────────────────────────────────────────────────────
// PR + ACHIEVEMENT CELEBRATIONS
// ─────────────────────────────────────────────────────────────────────────────

async function celebratePRsAndAchievements(profile, activities) {
  for (const activity of activities) {
    const hasPRs          = (activity.pr_count          || 0) > 0
    const hasAchievements = (activity.achievement_count || 0) > 0
    if (!hasPRs && !hasAchievements) continue

    // pr_celebrated flag prevents duplicate posts if this activity appears
    // in more than one incremental sync window
    const { data: stored } = await supabase
      .from('strava_activities')
      .select('pr_celebrated')
      .eq('id', activity.id)
      .eq('athlete_id', profile.id)
      .single()

    if (stored?.pr_celebrated) continue

    if (hasPRs) {
      const n = activity.pr_count
      await postToTrainingChannel(
        profile.id,
        `🏅 ${profile.full_name} set ${n === 1 ? '1 PR' : `${n} PRs`} on their ${activity.name}`
      )
    }

    if (hasAchievements) {
      const n = activity.achievement_count
      await postToTrainingChannel(
        profile.id,
        `🏆 ${profile.full_name} unlocked ${n === 1 ? '1 achievement' : `${n} achievements`} on their ${activity.name}`
      )
    }

    await supabase
      .from('strava_activities')
      .update({ pr_celebrated: true })
      .eq('id', activity.id)
      .eq('athlete_id', profile.id)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY CHALLENGE PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

async function updateChallengeProgress() {
  const { data: challenge } = await supabase
    .from('challenges')
    .select('*')
    .eq('is_active', true)
    .single()

  if (!challenge) return

  const weekEnd = new Date(challenge.week_start)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const { data: activities } = await supabase
    .from('strava_activities')
    .select('athlete_id, sport_type, distance, start_date')
    .gte('start_date', challenge.week_start)
    .lt('start_date',  weekEnd.toISOString())

  let progress = {}

  if (challenge.type === 'combined_distance') {
    const targetSport = normaliseSport(challenge.sport_type)
    let totalKm = 0
    for (const act of activities || []) {
      if (normaliseSport(act.sport_type) === targetSport) {
        totalKm += (act.distance || 0) / 1000
      }
    }
    progress = {
      type:       'combined_distance',
      sport_type: challenge.sport_type,
      target_km:  Number(challenge.target_value),
      current_km: Math.round(totalKm * 10) / 10,
      percent:    Math.min(100, Math.round((totalKm / challenge.target_value) * 100)),
    }

  } else if (challenge.type === 'everyone_logs_sport') {
    const targetSport = normaliseSport(challenge.sport_type)
    const completed = new Set()
    for (const act of activities || []) {
      if (normaliseSport(act.sport_type) === targetSport) completed.add(act.athlete_id)
    }

    // All Strava-connected athletes are in scope for this challenge
    const { data: allAthletes } = await supabase
      .from('profiles')
      .select('id, full_name, initials, avatar_color')
      .not('strava_athlete_id', 'is', null)

    const completedList = []
    const pendingList   = []
    for (const a of allAthletes || []) {
      const entry = { id: a.id, full_name: a.full_name, initials: a.initials, avatar_color: a.avatar_color }
      completed.has(a.id) ? completedList.push(entry) : pendingList.push(entry)
    }

    progress = {
      type:            'everyone_logs_sport',
      sport_type:      challenge.sport_type,
      completed:       completedList,
      pending:         pendingList,
      count_completed: completedList.length,
      count_total:     (allAthletes || []).length,
    }
  }

  await supabase.from('challenges')
    .update({ challenge_progress: progress, updated_at: new Date().toISOString() })
    .eq('id', challenge.id)

  console.log(`[challenge] Progress updated for "${challenge.title}"`)
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNNING TOTALS
// ─────────────────────────────────────────────────────────────────────────────

// Compute distance / PR / kudos from a set of activities.
// Called with full history on bootstrap; with new activities only on incremental.
function computeTotals(activities) {
  let runKm = 0, bikeKm = 0, swimKm = 0, prCount = 0, kudos = 0
  for (const a of activities) {
    const sport = normaliseSport(a.sport_type)
    const km    = (a.distance || 0) / 1000
    if (sport === 'run')  runKm  += km
    if (sport === 'ride') bikeKm += km
    if (sport === 'swim') swimKm += km
    prCount += a.pr_count    || 0
    kudos   += a.kudos_count || 0
  }
  return { runKm, bikeKm, swimKm, prCount, kudos }
}

// Add incremental delta to stored totals. Returns updated profile for badge checks.
async function incrementTotals(profile, delta) {
  const updates = {}
  if (delta.runKm   > 0) updates.total_run_km         = (parseFloat(profile.total_run_km)         || 0) + delta.runKm
  if (delta.bikeKm  > 0) updates.total_bike_km        = (parseFloat(profile.total_bike_km)        || 0) + delta.bikeKm
  if (delta.swimKm  > 0) updates.total_swim_km        = (parseFloat(profile.total_swim_km)        || 0) + delta.swimKm
  if (delta.prCount > 0) updates.total_pr_count       = (profile.total_pr_count                   || 0) + delta.prCount
  if (delta.kudos   > 0) updates.total_kudos_received = (profile.total_kudos_received             || 0) + delta.kudos

  if (!Object.keys(updates).length) return profile

  const { data: updated } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', profile.id)
    .select('total_run_km, total_bike_km, total_swim_km, total_pr_count, total_kudos_received')
    .single()

  return { ...profile, ...(updated || updates) }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRAVA API HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getValidToken(profile) {
  const now = Math.floor(Date.now() / 1000)
  // strava_token_expires_at is a bigint unix timestamp — matches schema
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

// Fetch one page of Strava activities. Throws with .rateLimited = true on 429.
async function fetchStravaPage(token, params = {}) {
  const qs  = new URLSearchParams({ per_page: 50, ...params }).toString()
  const res = await fetch(`${STRAVA_API}/athlete/activities?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 429) {
    const err = new Error('Strava rate limit')
    err.rateLimited = true
    throw err
  }
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function upsertActivities(athleteId, activities) {
  if (!activities.length) return

  const rows = activities.map(act => ({
    id:                     act.id,          // bigint primary key
    athlete_id:             athleteId,
    name:                   act.name                       || null,
    sport_type:             act.sport_type || act.type     || null,
    start_date:             act.start_date,
    start_date_local:       act.start_date_local           || null,
    moving_time:            act.moving_time                || null,
    elapsed_time:           act.elapsed_time               || null,
    distance:               act.distance                   || null,
    total_elevation_gain:   act.total_elevation_gain       || null,
    average_heartrate:      act.average_heartrate          || null,
    max_heartrate:          act.max_heartrate              || null,
    map_summary_polyline:   act.map?.summary_polyline      || null,
    kudos_count:            act.kudos_count                || 0,
    achievement_count:      act.achievement_count          || 0,
    average_speed:          act.average_speed              || null,
    max_speed:              act.max_speed                  || null,
    average_cadence:        act.average_cadence            || null,
    average_watts:          act.average_watts              || null,
    max_watts:              act.max_watts                  || null,
    weighted_average_watts: act.weighted_average_watts     || null,
    kilojoules:             act.kilojoules                 || null,
    suffer_score:           act.suffer_score               || null,
    pr_count:               act.pr_count                   || 0,
    trainer:                act.trainer                    || false,
    commute:                act.commute                    || false,
    gear_id:                act.gear_id                    || null,
    timezone:               act.timezone                   || null,
    synced_at:              new Date().toISOString(),
    // pr_celebrated is excluded — never overwrite true back to false on re-sync
  }))

  const { error } = await supabase
    .from('strava_activities')
    .upsert(rows, { onConflict: 'id' })

  if (error) console.error('[sync] upsert error:', error.message)
}

async function pruneOldActivities(athleteId) {
  const cutoff = getRetentionCutoff().toISOString()
  await supabase
    .from('strava_activities')
    .delete()
    .eq('athlete_id', athleteId)
    .lt('start_date', cutoff)
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGING HELPER
// ─────────────────────────────────────────────────────────────────────────────

// Cached within a single sync run — avoids repeated DB lookups
let _trainingChannelId = null

async function getTrainingChannelId() {
  if (_trainingChannelId) return _trainingChannelId
  const { data } = await supabase
    .from('channels')
    .select('id')
    .eq('category', 'training')
    .order('sort_order', { ascending: true })
    .limit(1)
    .single()
  _trainingChannelId = data?.id || null
  return _trainingChannelId
}

// messages.athlete_id is NOT NULL per schema, so we use the athlete's own ID
// as sender. Celebration posts appear attributed to the athlete in the feed.
async function postToTrainingChannel(athleteId, content) {
  const channelId = await getTrainingChannelId()
  if (!channelId) {
    console.warn('[sync] Training channel not found — skipping post')
    return
  }
  const { error } = await supabase
    .from('messages')
    .insert({ channel_id: channelId, athlete_id: athleteId, content })
  if (error) console.error('[sync] Failed to post message:', error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAK HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Returns ISO week key "YYYY-Www" for any date value
function isoWeek(date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo    = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// Count consecutive active weeks counting back from today.
// Streak must include this week or last week — matches Strava's own display.
function computeWeeklyStreak(activities) {
  const activeWeeks = new Set(activities.map(a => isoWeek(a.start_date)))
  if (!activeWeeks.size) return 0

  const now          = new Date()
  const thisWeek     = isoWeek(now)
  const prevWeekDate = new Date(now)
  prevWeekDate.setDate(prevWeekDate.getDate() - 7)
  const lastWeek = isoWeek(prevWeekDate)

  if (!activeWeeks.has(thisWeek) && !activeWeeks.has(lastWeek)) return 0

  let streak  = 0
  let current = activeWeeks.has(thisWeek) ? thisWeek : lastWeek

  while (activeWeeks.has(current)) {
    streak++
    const d = new Date(now)
    d.setDate(d.getDate() - streak * 7)
    current = isoWeek(d)
  }

  return streak
}

// Returns true when there is at least one calendar-week gap in the activity
// list. Used as the bootstrap stopping heuristic.
function hasWeeklyGap(activities) {
  if (activities.length < 2) return false
  const weeks = [...new Set(activities.map(a => isoWeek(a.start_date)))].sort()
  for (let i = 1; i < weeks.length; i++) {
    const [yA, wA] = weeks[i - 1].split('-W').map(Number)
    const [yB, wB] = weeks[i].split('-W').map(Number)
    if (yB * 53 + wB - (yA * 53 + wA) > 1) return true
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

// Group activities by UTC calendar date (YYYY-MM-DD)
function groupByDate(activities) {
  const groups = {}
  for (const a of activities) {
    const day = new Date(a.start_date).toISOString().slice(0, 10)
    if (!groups[day]) groups[day] = []
    groups[day].push(a)
  }
  return groups
}

// Sum swim/bike/run km for the current ISO week only
function currentWeekVolume(activities) {
  const thisWeek = isoWeek(new Date())
  let swimKm = 0, bikeKm = 0, runKm = 0
  for (const a of activities) {
    if (isoWeek(a.start_date) !== thisWeek) continue
    const sport = normaliseSport(a.sport_type)
    const km    = (a.distance || 0) / 1000
    if (sport === 'swim') swimKm += km
    if (sport === 'ride') bikeKm += km
    if (sport === 'run')  runKm  += km
  }
  return { swimKm, bikeKm, runKm }
}

// Collapse Strava's many sport_type strings to swim / ride / run
function normaliseSport(sportType) {
  const s = (sportType || '').toLowerCase()
  if (s.includes('swim'))                                                  return 'swim'
  if (s.includes('ride') || s.includes('cycling') || s.includes('virtual')) return 'ride'
  if (s.includes('run'))                                                   return 'run'
  return s
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
