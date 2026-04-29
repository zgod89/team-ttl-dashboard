/**
 * strava-sync.js — TTL Team Dashboard
 *
 * Runs every hour via GitHub Actions.
 *
 * For each connected athlete:
 *   - If bootstrap_status = 'pending'  → historical walk-back to compute initial streak
 *   - If bootstrap_status = 'complete' → incremental sync (last 2 days, keeps feed fresh)
 *
 * Stores:
 *   - strava_activities  : 14-day rolling window (feed display)
 *   - profiles           : streak columns only (current, longest, last_active)
 *
 * Never stores full history. Streak is computed once at bootstrap then
 * maintained incrementally on every subsequent sync.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STRAVA_BASE = 'https://www.strava.com/api/v3';
const FEED_DAYS   = 14;   // rolling window kept in strava_activities
const BUFFER_DAYS = 2;    // incremental sync looks back 2 days to survive a missed run

// ── Strava token refresh ───────────────────────────────────────────────────

async function refreshStravaToken(profile) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: profile.strava_refresh_token,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed for ${profile.id}: ${res.status}`);

  const data = await res.json();

  await supabase.from('profiles').update({
    strava_access_token:    data.access_token,
    strava_refresh_token:   data.refresh_token,
    strava_token_expires_at: data.expires_at,
  }).eq('id', profile.id);

  return data.access_token;
}

async function getValidToken(profile) {
  const nowSecs = Math.floor(Date.now() / 1000);
  // Refresh if token expires within 5 minutes
  if (profile.strava_token_expires_at - nowSecs < 300) {
    return await refreshStravaToken(profile);
  }
  return profile.strava_access_token;
}

// ── Strava API helpers ────────────────────────────────────────────────────

async function fetchActivities(token, { after, before, page = 1, perPage = 200 } = {}) {
  const params = new URLSearchParams({ per_page: perPage, page });
  if (after)  params.set('after',  after);
  if (before) params.set('before', before);

  const res = await fetch(`${STRAVA_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);

  return res.json();
}

// ── Streak helpers ────────────────────────────────────────────────────────

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Returns the Monday of the ISO week containing `date`, as a YYYY-MM-DD string.
 * Streak unit is the week — matching Strava's own streak display.
 */
function weekKey(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0]; // 'YYYY-MM-DD' of that Monday
}

function currentWeekKey()  { return weekKey(new Date()); }
function prevWeekKey()     { return weekKey(new Date(Date.now() - 7 * 86400_000)); }

/**
 * Given a list of activity date strings (YYYY-MM-DD, any order, may repeat),
 * compute the current consecutive-week streak.
 * A week is active if the athlete had at least one activity in it.
 * The streak must include this week or last week to be considered active.
 */
function computeWeekStreakFromDates(activityDates) {
  if (!activityDates.length) return 0;

  // Collect unique active week keys, sorted descending (most recent first)
  const activeWeeks = [...new Set(activityDates.map(d => weekKey(new Date(d))))].sort().reverse();

  const thisWeek = currentWeekKey();
  const lastWeek = prevWeekKey();

  // Streak must include this week or last week
  if (activeWeeks[0] !== thisWeek && activeWeeks[0] !== lastWeek) return 0;

  let streak = 0;
  let cursor = new Date(activeWeeks[0]); // start from the most recent active week

  for (const wk of activeWeeks) {
    const expected = toDateStr(cursor);
    if (wk === expected) {
      streak++;
      cursor = new Date(cursor.getTime() - 7 * 86400_000); // step back one week
    } else {
      break; // gap found
    }
  }

  return streak;
}

/**
 * The oldest date we need to fetch to confirm a gap before the streak.
 * If streak is N weeks, we need to go back N+1 weeks from the start of
 * the current/last active week to be sure there's nothing before it.
 */
function streakConfirmedBeyond(activeWeeks, streak) {
  if (!activeWeeks.length || streak === 0) return new Date();
  const oldestStreakWeek = new Date(activeWeeks[streak - 1]); // Monday of oldest week in streak
  // Go one more week back — if nothing there, gap is confirmed
  return new Date(oldestStreakWeek.getTime() - 7 * 86400_000);
}

/**
 * Incrementally update weekly streak given current profile state
 * and activity dates from the recent sync window.
 */
function incrementalStreakUpdate(profile, recentActivityDates) {
  const thisWeek = currentWeekKey();
  const lastWeek = prevWeekKey();

  const activeWeeks = [...new Set(recentActivityDates.map(d => weekKey(new Date(d))))];
  const hasThisWeek = activeWeeks.includes(thisWeek);
  const hasLastWeek = activeWeeks.includes(lastWeek);

  const lastActive = profile.training_streak_last_active; // stored as week key (Monday date)
  let current = profile.training_streak_current ?? 0;
  let longest = profile.training_streak_longest ?? 0;

  if (hasThisWeek) {
    if (lastActive === thisWeek) {
      return null; // already counted this week
    } else if (lastActive === lastWeek || current === 0) {
      current += 1;
    } else {
      current = 1; // gap — restart
    }
    longest = Math.max(current, longest);
    return { training_streak_current: current, training_streak_longest: longest, training_streak_last_active: thisWeek };
  }

  if (hasLastWeek) {
    if (lastActive === lastWeek) return null; // already counted
    const twoWeeksAgo = toDateStr(new Date(Date.now() - 14 * 86400_000));
    if (lastActive >= twoWeeksAgo || current === 0) {
      current += 1;
    } else {
      current = 1;
    }
    longest = Math.max(current, longest);
    return { training_streak_current: current, training_streak_longest: longest, training_streak_last_active: lastWeek };
  }

  // No activity this week or last — streak broken if lastActive is older than last week
  if (lastActive && lastActive < lastWeek) {
    return { training_streak_current: 0 };
  }

  return null;
}

// ── Activity upsert ───────────────────────────────────────────────────────

function mapActivity(raw, athleteId) {
  return {
    id:                    raw.id,
    athlete_id:            athleteId,
    name:                  raw.name,
    sport_type:            raw.sport_type ?? raw.type,
    start_date:            raw.start_date,
    start_date_local:      raw.start_date_local,
    distance:              raw.distance,
    moving_time:           raw.moving_time,
    elapsed_time:          raw.elapsed_time,
    total_elevation_gain:  raw.total_elevation_gain,
    average_heartrate:     raw.average_heartrate ?? null,
    max_heartrate:         raw.max_heartrate ?? null,
    map_summary_polyline:  raw.map?.summary_polyline ?? null,
  };
}

async function upsertActivities(activities, athleteId) {
  if (!activities.length) return;
  const rows = activities.map(a => mapActivity(a, athleteId));
  const { error } = await supabase
    .from('strava_activities')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

async function pruneOldActivities(athleteId) {
  const cutoff = new Date(Date.now() - FEED_DAYS * 86400_000).toISOString();
  await supabase
    .from('strava_activities')
    .delete()
    .eq('athlete_id', athleteId)
    .lt('start_date', cutoff);
}

// ── Bootstrap: historical walk-back ──────────────────────────────────────

/**
 * Fetches activities in reverse chronological order until a gap is found.
 * Only stores the last FEED_DAYS worth in strava_activities (feed display).
 * Activities older than FEED_DAYS are fetched, used to compute the streak,
 * then discarded — never inserted into the database.
 * Walk-back has no page cap: terminates naturally when a gap is confirmed
 * or when Strava returns an empty page (beginning of athlete's history).
 */
async function bootstrapAthlete(profile, token) {
  console.log(`  → Bootstrapping ${profile.full_name}...`);

  await supabase
    .from('profiles')
    .update({ strava_bootstrap_status: 'in_progress' })
    .eq('id', profile.id);

  const feedCutoff  = Math.floor((Date.now() - FEED_DAYS * 86400_000) / 1000);
  const allDates    = [];   // all activity dates for streak computation
  const feedActivities = []; // only last FEED_DAYS for storage

  let page = 1;
  let gapFound = false;
  let oldestActiveDate = null;

  while (!gapFound) {
    let activities;
    try {
      activities = await fetchActivities(token, { page, perPage: 200 });
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        console.warn(`  ⚠ Rate limited during bootstrap for ${profile.full_name} — will retry next run`);
        await supabase.from('profiles')
          .update({ strava_bootstrap_status: 'pending' })
          .eq('id', profile.id);
        return;
      }
      throw err;
    }

    if (!activities.length) break; // reached beginning of athlete's history

    for (const activity of activities) {
      const dateStr = activity.start_date_local.split('T')[0];
      allDates.push(dateStr);

      const activityTs = new Date(activity.start_date).getTime() / 1000;
      if (activityTs >= feedCutoff) {
        feedActivities.push(activity);
      }

      oldestActiveDate = dateStr;
    }

    // Compute streak from everything fetched so far
    const streak = computeWeekStreakFromDates(allDates);

    // To confirm the streak we need to have fetched at least one week
    // further back than the streak's oldest week. If the oldest activity
    // we've fetched pre-dates the required gap window, we're done.
    const activeWeeks = [...new Set(allDates.map(d => weekKey(new Date(d))))].sort().reverse();
    const gapConfirmBefore = streakConfirmedBeyond(activeWeeks, streak);
    const oldestFetched = new Date(oldestActiveDate);

    if (oldestFetched <= gapConfirmBefore) {
      gapFound = true;
    }

    page++;
  }

  const streakCurrent = computeWeekStreakFromDates(allDates);
  const activeWeeks   = [...new Set(allDates.map(d => weekKey(new Date(d))))].sort().reverse();
  const lastActive    = activeWeeks[0] ?? null; // store as week key (Monday date)

  // Store only feed window activities
  if (feedActivities.length) {
    await upsertActivities(feedActivities, profile.id);
  }

  await supabase.from('profiles').update({
    strava_bootstrap_status:    'complete',
    training_streak_current:    streakCurrent,
    training_streak_longest:    streakCurrent, // first run — current is longest we know of
    training_streak_last_active: lastActive,
    strava_last_synced_at:      new Date().toISOString(),
  }).eq('id', profile.id);

  console.log(`  ✓ Bootstrap complete: streak = ${streakCurrent} weeks, feed activities = ${feedActivities.length}`);
}

// ── Incremental sync ──────────────────────────────────────────────────────

async function incrementalSync(profile, token) {
  console.log(`  → Incremental sync for ${profile.full_name}...`);

  // Fetch last BUFFER_DAYS to survive a missed hourly run
  const after = Math.floor((Date.now() - BUFFER_DAYS * 86400_000) / 1000);
  const activities = await fetchActivities(token, { after });

  if (activities.length) {
    await upsertActivities(activities, profile.id);
  }

  // Prune feed to FEED_DAYS rolling window
  await pruneOldActivities(profile.id);

  // Compute streak update from recent activity dates (weekly granularity)
  const recentDates = activities.map(a => a.start_date_local.split('T')[0]);
  const streakUpdate = incrementalStreakUpdate(profile, recentDates);

  const profileUpdate = { strava_last_synced_at: new Date().toISOString() };
  if (streakUpdate) Object.assign(profileUpdate, streakUpdate);

  await supabase.from('profiles').update(profileUpdate).eq('id', profile.id);

  console.log(`  ✓ Synced ${activities.length} recent activities${streakUpdate ? `, streak → ${streakUpdate.training_streak_current ?? profile.training_streak_current}` : ''}`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚴 Strava sync — ${new Date().toISOString()}`);

  // Fetch all athletes with Strava connected
  const { data: athletes, error } = await supabase
    .from('profiles')
    .select(`
      id, full_name,
      strava_access_token, strava_refresh_token, strava_token_expires_at,
      strava_bootstrap_status,
      training_streak_current, training_streak_longest, training_streak_last_active
    `)
    .not('strava_access_token', 'is', null);

  if (error) throw error;
  if (!athletes?.length) {
    console.log('No athletes with Strava connected.');
    return;
  }

  console.log(`Found ${athletes.length} connected athlete(s)\n`);

  for (const profile of athletes) {
    try {
      console.log(`Processing: ${profile.full_name} (bootstrap: ${profile.strava_bootstrap_status})`);
      const token = await getValidToken(profile);

      if (profile.strava_bootstrap_status !== 'complete') {
        await bootstrapAthlete(profile, token);
      } else {
        await incrementalSync(profile, token);
      }
    } catch (err) {
      console.error(`  ✗ Error syncing ${profile.full_name}:`, err.message);
      // Continue with next athlete — don't let one failure kill the whole run
    }
  }

  console.log('\n✅ Sync complete');
}

main().catch(err => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
