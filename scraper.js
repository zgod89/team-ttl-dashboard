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
// IRONMAN.COM SCRAPER — extracts race links from server-rendered HTML
// The page renders race cards statically with href links like:
// /races/im703-los-cabos or /races/im-texas
// We extract all links, fetch each race page for date/location details
// ---------------------------------------------------------------
async function scrapeIronmanRaces() {
  console.log('[Ironman] Scraping ironman.com/races for race links...');

  const response = await fetch('https://www.ironman.com/races', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TriTeamBot/1.0)', 'Accept': 'text/html' }
  });

  if (!response.ok) {
    console.error('[Ironman] Failed to fetch page:', response.status);
    return [];
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract all race detail links from anchor tags
  const raceLinks = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    // Match /races/im-xxxx and /races/im703-xxxx patterns
    if (href.match(/^\/races\/im/i)) {
      raceLinks.add(`https://www.ironman.com${href}`);
    }
  });

  console.log(`[Ironman] Found ${raceLinks.size} race links`);

  const races = [];

  for (const raceUrl of raceLinks) {
    try {
      const slug = raceUrl.split('/races/')[1];
      const is703 = slug.startsWith('im703') || slug.startsWith('im-703');
      const type = is703 ? '70.3' : 'IRONMAN';

      // Convert slug to a readable name e.g. im703-los-cabos → IRONMAN 70.3 Los Cabos
      const namePart = slug
        .replace(/^im703-?/i, '')
        .replace(/^im-?/i, '')
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      const name = type === '70.3' ? `IRONMAN 70.3 ${namePart}` : `IRONMAN ${namePart}`;

      // Fetch individual race page for date and location
      const raceRes = await fetch(raceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TriTeamBot/1.0)', 'Accept': 'text/html' }
      });

      if (!raceRes.ok) continue;

      const raceHtml = await raceRes.text();
      const $r = cheerio.load(raceHtml);

      // Extract date — look for common date patterns in meta tags and page content
      let race_date = null;
      const metaDate = $r('meta[property="event:start_time"]').attr('content')
        || $r('meta[name="event-date"]').attr('content')
        || $r('time').first().attr('datetime');

      if (metaDate) {
        race_date = metaDate.split('T')[0];
      } else {
        // Fallback: scan text for date patterns like "April 5, 2026"
        const bodyText = $r('body').text();
        const dateMatch = bodyText.match(/([A-Z][a-z]+ \d{1,2},?\s+202[5-9])/);
        if (dateMatch) race_date = parseDateStr(dateMatch[1]);
      }

      // Extract location from meta or structured data
      const location = $r('meta[property="event:location"]').attr('content')
        || $r('[class*="location"]').first().text().trim()
        || namePart;

      if (!race_date) {
        console.log(`[Ironman] No date found for ${name} — skipping`);
        continue;
      }

      races.push({
        name,
        type,
        race_date,
        location,
        external_id: `ironman_${slug}`,
        source: 'ironman_scrape',
        registration_url: raceUrl,
      });

      console.log(`[Ironman] Found: ${name} | ${race_date} | ${location}`);

      // Polite delay to avoid hammering the server
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.error(`[Ironman] Error processing ${raceUrl}:`, err.message);
    }
  }

  console.log(`[Ironman] Scraped ${races.length} IRONMAN races`);
  return races;
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
