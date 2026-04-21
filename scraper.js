/**
 * TriTeam Race Scraper + WhatsApp Notifier
 * Node.js service — runs on a cron schedule (daily scrape, daily notification check)
 *
 * Install: npm install
 * Run:     node scraper.js
 * Cron:    0 6 * * * node /path/to/scraper.js   (runs at 6am daily)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// --- Config ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const TRIATHLON_API_KEY = process.env.TRIATHLON_API_KEY;
const TRIATHLON_API_BASE = 'https://api.triathlon.org/v1';

// ---------------------------------------------------------------
// FEATURE FLAG — set to true once Meta Business account is ready
// ---------------------------------------------------------------
const NOTIFICATIONS_ENABLED = false;

// Meta WhatsApp Cloud API config (unused until NOTIFICATIONS_ENABLED = true)
// const WA_API_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
// const WA_TOKEN = process.env.WHATSAPP_TOKEN;
// const WA_CHANNEL_ID = process.env.WHATSAPP_CHANNEL_ID;

// ---------------------------------------------------------------
// TRIATHLON.ORG API — fetch events by date range
// Covers IRONMAN, 70.3, Olympic, Sprint, and all other tri events
// API docs: https://developers.triathlon.org
// ---------------------------------------------------------------
async function fetchTriathlonEvents() {
  console.log('[Scraper] Fetching events from triathlon.org API...');

  if (!TRIATHLON_API_KEY) {
    console.error('[Scraper] TRIATHLON_API_KEY not set — cannot fetch events');
    return [];
  }

  const currentYear = new Date().getFullYear();
  const startDate = `${currentYear}-01-01`;
  const endDate = `${currentYear + 1}-12-31`;

  const url = `${TRIATHLON_API_BASE}/events?start_date=${startDate}&end_date=${endDate}&per_page=500&order=asc`;
  console.log(`[Scraper] Requesting: ${url}`);

  const response = await fetch(url, {
    headers: {
      'apikey': TRIATHLON_API_KEY,
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[Scraper] API error ${response.status}:`, text);
    return [];
  }

  const json = await response.json();
  const events = json.data || [];
  console.log(`[Scraper] API returned ${events.length} total events`);

  const races = [];
  for (const event of events) {
    const name = event.event_title || '';
    const nameUpper = name.toUpperCase();

    let type = null;
    if (name.includes('70.3')) {
      type = '70.3';
    } else if (nameUpper.includes('IRONMAN')) {
      type = 'IRONMAN';
    } else if (
      nameUpper.includes('TRIATHLON') ||
      nameUpper.includes('TRISTAR') ||
      nameUpper.includes('TRI ') ||
      nameUpper.includes('XTERRA')
    ) {
      type = 'Other';
    } else {
      continue;
    }

    const race_date = event.event_date ? event.event_date.split('T')[0] : null;
    if (!race_date) continue;

    const city = event.event_venue || event.event_city || '';
    const country = event.event_country_name || event.event_country_id || '';
    const location = [city, country].filter(Boolean).join(', ') || 'TBD';

    races.push({
      name,
      type,
      race_date,
      location,
      city: event.event_city || null,
      country: event.event_country_name || null,
      latitude: event.event_lat ? parseFloat(event.event_lat) : null,
      longitude: event.event_lng ? parseFloat(event.event_lng) : null,
      external_id: `triorg_${event.event_id}`,
      source: 'triathlon_api',
      registration_url: event.event_website || null,
    });
  }

  console.log(`[Scraper] Filtered to ${races.length} triathlon events`);
  return races;
}

// ---------------------------------------------------------------
// UPSERT RACES — insert new, update existing (by external_id)
// ---------------------------------------------------------------
async function upsertRaces(races) {
  if (races.length === 0) {
    console.log('[DB] No races to upsert');
    return;
  }

  const batchSize = 100;
  let totalUpserted = 0;

  for (let i = 0; i < races.length; i += batchSize) {
    const batch = races.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('races')
      .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false })
      .select();

    if (error) {
      console.error(`[DB] Upsert error (batch ${Math.floor(i / batchSize) + 1}):`, error.message);
    } else {
      totalUpserted += data?.length ?? 0;
    }
  }

  console.log(`[DB] Upserted ${totalUpserted} races total`);
}

// ---------------------------------------------------------------
// NOTIFICATION — Check for races this weekend & notify WhatsApp
// Disabled until Meta Business account is approved.
// To re-enable: set NOTIFICATIONS_ENABLED = true at the top,
// then uncomment the WA_API_URL / WA_TOKEN / WA_CHANNEL_ID lines.
// ---------------------------------------------------------------
async function checkAndNotify() {
  if (!NOTIFICATIONS_ENABLED) {
    console.log('[Notify] Notifications disabled — skipping (set NOTIFICATIONS_ENABLED = true to activate)');
    return;
  }

  console.log('[Notify] Checking for race-weekend notifications...');

  const today = new Date();
  const dayOfWeek = today.getDay();

  if (dayOfWeek !== 4 && dayOfWeek !== 5) {
    console.log('[Notify] Not a Thursday/Friday — skipping notification check');
    return;
  }

  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (6 - dayOfWeek));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);

  const satStr = saturday.toISOString().split('T')[0];
  const sunStr = sunday.toISOString().split('T')[0];

  const { data: races, error } = await supabase
    .from('races')
    .select(`
      id, name, type, race_date, location,
      race_entries(
        athlete_id,
        profiles(full_name, whatsapp_number)
      )
    `)
    .in('race_date', [satStr, sunStr]);

  if (error) { console.error('[Notify] DB error:', error.message); return; }
  if (!races || races.length === 0) { console.log('[Notify] No races this weekend'); return; }

  for (const race of races) {
    const entries = race.race_entries || [];
    if (entries.length === 0) continue;

    const names = entries.map(e => e.profiles?.full_name).filter(Boolean).join(', ');
    const emoji = race.type === 'IRONMAN' ? '🏊🚴🏃' : race.type === '70.3' ? '⚡' : '🏅';
    const message =
      `${emoji} *Race Weekend Alert!*\n\n` +
      `*${race.name}* (${race.type})\n` +
      `📍 ${race.location}\n` +
      `📅 ${race.race_date}\n\n` +
      `Team members racing: *${names}*\n\n` +
      `Go team! 💪`;

    await sendWhatsAppMessage(message, race.id);
  }
}

// Dormant until NOTIFICATIONS_ENABLED = true
async function sendWhatsAppMessage(message, raceId) {
  const WA_API_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const WA_TOKEN = process.env.WHATSAPP_TOKEN;
  const WA_CHANNEL_ID = process.env.WHATSAPP_CHANNEL_ID;

  try {
    const response = await fetch(WA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: WA_CHANNEL_ID,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(JSON.stringify(err));
    }

    await supabase.from('notification_log').insert({
      race_id: raceId, channel: 'whatsapp', message, status: 'sent',
    });

    console.log('[Notify] WhatsApp message sent for race:', raceId);
  } catch (err) {
    console.error('[Notify] WhatsApp send failed:', err.message);
    await supabase.from('notification_log').insert({
      race_id: raceId, channel: 'whatsapp', message, status: 'failed',
    });
  }
}

// ---------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------
async function main() {
  console.log('=== TriTeam Scraper/Notifier ===', new Date().toISOString());

  try {
    // 1. Fetch races from triathlon.org API
    const races = await fetchTriathlonEvents();
    await upsertRaces(races);

    // 2. Check for weekend notifications (currently disabled — see NOTIFICATIONS_ENABLED flag)
    await checkAndNotify();

    console.log('=== Done ===');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
