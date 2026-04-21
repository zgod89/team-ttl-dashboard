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
import * as cheerio from 'cheerio';

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
  if (events.length > 0) {
    console.log('[Scraper] Sample event fields:', JSON.stringify(events[0], null, 2).substring(0, 500));
  }

  const races = [];
  for (const event of events) {
    const name = event.event_title || '';
    const nameUpper = name.toUpperCase();

    // Classify type based on name
    let type;
    if (name.includes('70.3')) {
      type = '70.3';
    } else if (nameUpper.includes('IRONMAN')) {
      type = 'IRONMAN';
    } else if (nameUpper.includes('OLYMPIC')) {
      type = 'Olympic';
    } else if (nameUpper.includes('SPRINT')) {
      type = 'Sprint';
    } else if (nameUpper.includes('XTERRA')) {
      type = 'XTERRA';
    } else if (
      nameUpper.includes('TRIATHLON') ||
      nameUpper.includes('TRISTAR') ||
      nameUpper.includes('TRI ') ||
      nameUpper.includes('DUATHLON') ||
      nameUpper.includes('AQUATHLON')
    ) {
      type = 'Other';
    } else {
      continue; // skip unrelated events
    }

    const race_date = event.event_date ? event.event_date.split('T')[0] : null;
    if (!race_date) continue;

    // triathlon.org field names — venue is the city/location name
    const venue = event.event_venue || '';
    const country = event.event_country || event.event_country_name || '';
    const location = [venue, country].filter(Boolean).join(', ') || 'TBD';

    // Coordinates come back as event_latitude / event_longitude
    const lat = event.event_latitude ?? event.event_lat ?? null;
    const lng = event.event_longitude ?? event.event_lng ?? null;

    races.push({
      name,
      type,
      race_date,
      location,
      city: venue || null,
      country: country || null,
      latitude: lat ? parseFloat(lat) : null,
      longitude: lng ? parseFloat(lng) : null,
      external_id: `triorg_${event.event_id}`,
      source: 'triathlon_api',
      registration_url: event.event_website || event.event_listing || null,
    });
  }

  console.log(`[Scraper] Filtered to ${races.length} triathlon events`);
  return races;
}

// ---------------------------------------------------------------
// PTO RACE CALENDAR SCRAPER — stats.protriathletes.org/pro-race-calendar
// Server-rendered HTML, covers all IRONMAN & 70.3 events worldwide
// ---------------------------------------------------------------
async function scrapeIronmanRaces() {
  console.log('[PTO] Fetching race calendar from stats.protriathletes.org...');

  const response = await fetch('https://stats.protriathletes.org/pro-race-calendar', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html',
    }
  });

  if (!response.ok) {
    console.error('[PTO] Failed to fetch calendar:', response.status);
    return [];
  }

  const html = await response.text();
  console.log(`[PTO] HTML length: ${html.length} chars`);

  const $ = cheerio.load(html);
  const races = [];

  // The page has race links like: <a href="/race/im-703-peru/2026/results">Ironman 70.3 Peru</a>
  // followed by plain text blocks with Country:, Location:, Distance:
  // We find all race links then walk up to grab the surrounding text block
  $('a[href*="/race/"]').each((_, el) => {
    try {
      const name = $(el).text().trim();
      if (!name || name.length < 3) return;

      // Only process IRONMAN branded races
      if (!/ironman/i.test(name)) return;

      // Get full text of nearest containing block
      // Walk up until we find a block with Country: in it
      let container = $(el).parent();
      let attempts = 0;
      while (attempts < 8 && !container.text().includes('Country:')) {
        container = container.parent();
        attempts++;
      }
      const blockText = container.text();

      // Extract date — "26 April 2026" or "TBA November 2026"
      const dateMatch = blockText.match(/(\d{1,2}\s+[A-Z][a-z]+\s+20\d{2})/);
      if (!dateMatch) {
        console.log(`[PTO] No date for: ${name}`);
        return;
      }
      const race_date = parseDateStr(dateMatch[1]);
      if (!race_date) return;

      // Extract Country and Location — stop before next field label
      const countryMatch = blockText.match(/Country:\s*([^:\n\r]+?)(?=\s*(?:Location:|Division:|Distance:|$))/);
      const locationMatch = blockText.match(/Location:\s*([^:\n\r]+?)(?=\s*(?:Country:|Division:|Distance:|$))/);
      const distanceMatch = blockText.match(/Distance:\s*([^:\n\r]+?)(?=\s*(?:Country:|Location:|Division:|$))/);

      const country = countryMatch ? countryMatch[1].trim() : '';
      const locationCity = locationMatch ? locationMatch[1].trim() : '';
      const distanceStr = distanceMatch ? distanceMatch[1].trim() : '';
      const location = [locationCity, country].filter(Boolean).join(', ') || 'TBD';

      // Classify type
      let type;
      if (name.includes('70.3') || distanceStr.toLowerCase().includes('half')) {
        type = '70.3';
      } else {
        type = 'IRONMAN';
      }

      const slug = $(el).attr('href')?.split('/race/')[1]?.split('/')[0] || '';
      const external_id = `pto_${slug || name.toLowerCase().replace(/\s+/g, '-')}_${race_date}`;

      races.push({
        name,
        type,
        race_date,
        location,
        country: country || null,
        external_id,
        source: 'pto_scrape',
        registration_url: `https://www.ironman.com/races`,
      });

      console.log(`[PTO] ${name} | ${race_date} | ${location}`);
    } catch (err) {
      console.error('[PTO] Error parsing entry:', err.message);
    }
  });

  // Deduplicate by external_id
  const seen = new Set();
  const unique = races.filter(r => {
    if (seen.has(r.external_id)) return false;
    seen.add(r.external_id);
    return true;
  });

  console.log(`[PTO] Found ${unique.length} IRONMAN/70.3 races`);
  return unique;
}

function parseDateStr(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
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
    // 1. Fetch from triathlon.org API (Olympic, Sprint, WTS, and some IRONMAN events)
    const triEvents = await fetchTriathlonEvents();

    // 2. Scrape ironman.com directly for full IRONMAN & 70.3 race list
    const ironmanRaces = await scrapeIronmanRaces();

    // 3. Merge — triathlon.org first, ironman.com fills in the gaps
    const all = [...triEvents, ...ironmanRaces];
    console.log(`[Main] Total combined races: ${all.length}`);
    await upsertRaces(all);

    // 2. Check for weekend notifications (currently disabled — see NOTIFICATIONS_ENABLED flag)
    await checkAndNotify();

    console.log('=== Done ===');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
