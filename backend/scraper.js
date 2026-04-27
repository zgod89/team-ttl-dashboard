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
        registration_url: slug
          ? `https://www.ironman.com/races/${
              slug
                .replace(/^ironman-703-/, 'im703-')
                .replace(/^im-703-/, 'im703-')
                .replace(/^ironman-/, 'im-')
            }`
          : `https://www.ironman.com/races`,
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
// GEOCODER — OpenStreetMap Nominatim (free, no API key required)
// Adds lat/lon and city to a race based on its location string
// ---------------------------------------------------------------

function extractCityFromName(raceName) {
  // Strip "Ironman 70.3 " or "Ironman " prefix and take what's left
  // e.g. "Ironman 70.3 Chattanooga" → "Chattanooga"
  // e.g. "Ironman Hamburg" → "Hamburg"
  // Only use this if the remainder is a single recognisable place name (no spaces = likely a city)
  const stripped = raceName
    .replace(/^ironman\s+70\.3\s+/i, '')
    .replace(/^ironman\s+/i, '')
    .trim();
  // Accept as city if it's 1-3 words and doesn't look like a generic descriptor
  if (stripped && stripped.split(' ').length <= 3 && !/championship|world|series/i.test(stripped)) {
    return stripped;
  }
  return null;
}

function extractCityFromLocation(location) {
  // "Hamburg, Germany" → "Hamburg"
  // "State College, PA, United States" → "State College"
  // "United States" (country only) → null
  if (!location || location === 'TBD') return null;
  const parts = location.split(',').map(p => p.trim());
  // If only one part it's just a country — no city
  if (parts.length < 2) return null;
  return parts[0] || null;
}

async function geocodeRaces(races) {
  console.log(`[Geocode] Geocoding ${races.length} races...`);
  const results = [];

  for (const race of races) {
    if (race.latitude && race.longitude) {
      results.push(race);
      continue;
    }

    // Derive best city guess before geocoding
    const cityFromName = extractCityFromName(race.name);
    const cityFromLocation = extractCityFromLocation(race.location);
    const bestCity = cityFromName || cityFromLocation || null;

    // Build geocode query — use city+country if we have it, else full location
    // Append "city" as a hint to help Nominatim prefer populated places over islands/regions
    const geocodeQuery = bestCity && race.country
      ? `${bestCity}, ${race.country}`
      : race.location;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(geocodeQuery)}&format=json&limit=3&addressdetails=1`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'TriTeamDashboard/1.0 (team race tracker)',
          'Accept': 'application/json',
        }
      });

      if (!res.ok) { results.push(race); continue; }

      const data = await res.json();

      if (data.length > 0) {
        // Pick the result that has the richest city-level address data
        const ranked = data.sort((a, b) => {
          const aHasCity = !!(a.address?.city || a.address?.town || a.address?.village);
          const bHasCity = !!(b.address?.city || b.address?.town || b.address?.village);
          return (bHasCity ? 1 : 0) - (aHasCity ? 1 : 0);
        });
        const place = ranked[0];
        const addr = place.address || {};
        const placeType = place.type || '';

        // Extract city from structured address — most reliable signal
        const geocodedCity = addr.city || addr.town || addr.village ||
          addr.municipality || addr.city_district || null;

        // Types that are definitively NOT cities — reject coords for these
        const invalidTypes = ['bay', 'sea', 'ocean', 'river', 'lake', 'region',
          'state', 'country', 'continent', 'county', 'district'];
        const isInvalidType = invalidTypes.includes(placeType) && !geocodedCity;

        const confirmedCity = geocodedCity || (!isInvalidType ? bestCity : null);

        if (!confirmedCity || isInvalidType) {
          console.log(`[Geocode] "${race.name}" → type "${placeType}", no city found — skipping coords`);
          results.push({ ...race, city: null, latitude: null, longitude: null });
        } else {
          results.push({
            ...race,
            city: confirmedCity,
            latitude: parseFloat(place.lat),
            longitude: parseFloat(place.lon),
          });
          console.log(`[Geocode] ${race.name} → ${confirmedCity} (${place.lat}, ${place.lon})`);
        }
      } else {
        console.log(`[Geocode] No result for: ${geocodeQuery} — skipping coords`);
        results.push({ ...race, city: bestCity, latitude: null, longitude: null });
      }

      // Nominatim rate limit: max 1 request/second
      await new Promise(r => setTimeout(r, 1100));

    } catch (err) {
      console.error(`[Geocode] Error for ${race.name}:`, err.message);
      results.push(race);
    }
  }

  console.log(`[Geocode] Done — ${results.filter(r => r.latitude).length}/${races.length} races geocoded`);
  return results;
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
// CLEANUP — delete race threads older than 14 days post-race
// ---------------------------------------------------------------
async function cleanupOldRaceChannels() {
  console.log('[Cleanup] Checking for expired race channels...');

  // Find race channels where the race was more than 14 days ago
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  const { data: expiredChannels, error: fetchError } = await supabase
    .from('channels')
    .select('id, name, races(name, race_date)')
    .eq('type', 'race')
    .not('race_id', 'is', null);

  if (fetchError) {
    console.error('[Cleanup] Failed to fetch race channels:', fetchError.message);
    return;
  }

  const toDelete = (expiredChannels || []).filter(ch => {
    const raceDate = ch.races?.race_date;
    return raceDate && raceDate < cutoffDate;
  });

  if (toDelete.length === 0) {
    console.log('[Cleanup] No expired race channels found.');
    return;
  }

  console.log(`[Cleanup] Found ${toDelete.length} expired race channel(s) to delete:`);
  toDelete.forEach(ch => console.log(`  - #${ch.name} (race: ${ch.races?.race_date})`));

  // Delete channels — messages/reactions/mentions cascade automatically
  const ids = toDelete.map(ch => ch.id);
  const { error: deleteError } = await supabase
    .from('channels')
    .delete()
    .in('id', ids);

  if (deleteError) {
    console.error('[Cleanup] Failed to delete channels:', deleteError.message);
  } else {
    console.log(`[Cleanup] Successfully deleted ${toDelete.length} expired race channel(s).`);
  }
}

// ---------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------
async function main() {
  console.log('=== TriTeam Scraper/Notifier ===', new Date().toISOString());

  try {
    // 1. Fetch from triathlon.org API (Olympic, Sprint, WTS events)
    const triEvents = await fetchTriathlonEvents();

    // 2. Scrape PTO calendar for IRONMAN & 70.3 races
    const ironmanRaces = await scrapeIronmanRaces();

    // 3. Geocode IRONMAN races — adds lat/lon and city via OpenStreetMap
    const geocodedIronman = await geocodeRaces(ironmanRaces);

    // 4. Merge and upsert
    const all = [...triEvents, ...geocodedIronman];
    console.log(`[Main] Total combined races: ${all.length}`);
    await upsertRaces(all);

    // 5. Check for weekend notifications (currently disabled — see NOTIFICATIONS_ENABLED flag)
    await checkAndNotify();

    // 6. Clean up race chat threads older than 14 days post-race
    await cleanupOldRaceChannels();

    console.log('=== Done ===');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
