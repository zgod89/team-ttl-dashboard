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

// ---------------------------------------------------------------
// FEATURE FLAG — set to true once Meta Business account is ready
// ---------------------------------------------------------------
const NOTIFICATIONS_ENABLED = false;

// Meta WhatsApp Cloud API config (unused until NOTIFICATIONS_ENABLED = true)
// const WA_API_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
// const WA_TOKEN = process.env.WHATSAPP_TOKEN;
// const WA_CHANNEL_ID = process.env.WHATSAPP_CHANNEL_ID;

// ---------------------------------------------------------------
// SCRAPER — Primary: ironman.com race listings page
// ---------------------------------------------------------------
async function scrapeIronmanRaces() {
  console.log('[Scraper] Fetching from ironman.com/races...');

  const urls = [
    'https://www.ironman.com/races',
    'https://www.ironman.com/races?distance=full',
    'https://www.ironman.com/races?distance=half',
  ];

  const races = [];

  for (const url of urls) {
    try {
      console.log(`[Scraper] Fetching ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TriTeamBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        }
      });

      console.log(`[Scraper] Status: ${response.status}`);
      if (!response.ok) continue;

      const html = await response.text();
      console.log(`[Scraper] HTML length: ${html.length} chars`);

      const $ = cheerio.load(html);

      // Try multiple selector patterns ironman.com has used
      const selectors = [
        '.race-card', '.event-card', '.race-listing',
        '[class*="race"]', '[class*="event"]', 'article',
      ];

      for (const sel of selectors) {
        const found = $(sel).length;
        if (found > 0) console.log(`[Scraper] Selector "${sel}" matched ${found} elements`);
      }

      // Parse race cards — try several known HTML patterns
      $('[class*="race-card"], [class*="event-card"], .race-listing-item').each((i, el) => {
        const name = $(el).find('[class*="title"], [class*="name"], h2, h3').first().text().trim();
        const dateStr = $(el).find('[class*="date"], time').first().text().trim();
        const location = $(el).find('[class*="location"], [class*="place"]').first().text().trim();
        const href = $(el).find('a').first().attr('href') || '';

        if (name && (name.toUpperCase().includes('IRONMAN') || name.includes('70.3'))) {
          const type = name.includes('70.3') ? '70.3' : 'IRONMAN';
          const race_date = parseDateStr(dateStr);
          if (race_date) {
            races.push({
              name,
              type,
              race_date,
              location: location || 'TBD',
              source: 'scraped',
              external_id: `ironman_${name.replace(/\s+/g, '_').toLowerCase()}_${race_date}`,
              registration_url: href.startsWith('http') ? href : href ? `https://www.ironman.com${href}` : null,
            });
            console.log(`[Scraper] Found race: ${name} on ${race_date}`);
          }
        }
      });

    } catch (err) {
      console.error(`[Scraper] Error fetching ${url}:`, err.message);
    }
  }

  console.log(`[Scraper] Total from ironman.com: ${races.length}`);
  return races;
}

// ---------------------------------------------------------------
// SCRAPER — Fallback: hardcoded 2025/2026 race list
// Used when the website scrape returns 0 results (e.g. bot blocking)
// Update this list manually each season if needed.
// ---------------------------------------------------------------
function getHardcodedRaces() {
  console.log('[Scraper] Using hardcoded race list as fallback...');
  return [
    { name: 'IRONMAN 70.3 Oceanside', type: '70.3', race_date: '2025-04-05', location: 'Oceanside, CA, USA' },
    { name: 'IRONMAN Texas', type: 'IRONMAN', race_date: '2025-04-26', location: 'The Woodlands, TX, USA' },
    { name: 'IRONMAN 70.3 St. George', type: '70.3', race_date: '2025-05-03', location: 'St. George, UT, USA' },
    { name: 'IRONMAN 70.3 Chattanooga', type: '70.3', race_date: '2025-05-18', location: 'Chattanooga, TN, USA' },
    { name: 'IRONMAN 70.3 Raleigh', type: '70.3', race_date: '2025-06-01', location: 'Raleigh, NC, USA' },
    { name: 'IRONMAN Boulder', type: 'IRONMAN', race_date: '2025-06-08', location: 'Boulder, CO, USA' },
    { name: 'IRONMAN 70.3 Eagleman', type: '70.3', race_date: '2025-06-08', location: 'Cambridge, MD, USA' },
    { name: 'IRONMAN Coeur d\'Alene', type: 'IRONMAN', race_date: '2025-06-29', location: 'Coeur d\'Alene, ID, USA' },
    { name: 'IRONMAN Lake Placid', type: 'IRONMAN', race_date: '2025-07-20', location: 'Lake Placid, NY, USA' },
    { name: 'IRONMAN 70.3 Maine', type: '70.3', race_date: '2025-07-27', location: 'Kennebunkport, ME, USA' },
    { name: 'IRONMAN Mont-Tremblant', type: 'IRONMAN', race_date: '2025-08-24', location: 'Mont-Tremblant, QC, Canada' },
    { name: 'IRONMAN 70.3 Mont-Tremblant', type: '70.3', race_date: '2025-08-23', location: 'Mont-Tremblant, QC, Canada' },
    { name: 'IRONMAN Wisconsin', type: 'IRONMAN', race_date: '2025-09-07', location: 'Madison, WI, USA' },
    { name: 'IRONMAN 70.3 Augusta', type: '70.3', race_date: '2025-09-28', location: 'Augusta, GA, USA' },
    { name: 'IRONMAN World Championship', type: 'IRONMAN', race_date: '2025-10-11', location: 'Kailua-Kona, HI, USA' },
    { name: 'IRONMAN 70.3 World Championship', type: '70.3', race_date: '2025-10-25', location: 'Nice, France' },
    { name: 'IRONMAN Florida', type: 'IRONMAN', race_date: '2025-11-01', location: 'Panama City Beach, FL, USA' },
    { name: 'IRONMAN 70.3 Indian Wells', type: '70.3', race_date: '2025-12-07', location: 'Indian Wells, CA, USA' },
  ].map(r => ({
    ...r,
    source: 'hardcoded',
    external_id: `hardcoded_${r.name.replace(/\s+/g, '_').toLowerCase()}_${r.race_date}`,
  }));
}

function parseDateStr(str) {
  if (!str) return null;
  // Handle formats like "April 5, 2025", "05 Apr 2025", "2025-04-05"
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------
// UPSERT RACES — insert new, skip existing (by external_id)
// ---------------------------------------------------------------
async function upsertRaces(races) {
  const valid = races.filter(r => r.race_date && r.name);
  const { data, error } = await supabase
    .from('races')
    .upsert(valid, { onConflict: 'external_id', ignoreDuplicates: true })
    .select();

  if (error) console.error('[DB] Upsert error:', error.message);
  else console.log(`[DB] Upserted ${data?.length ?? 0} races`);
}

// ---------------------------------------------------------------
// NOTIFICATION — Check for races this weekend & notify WhatsApp
// Disabled until Meta Business account is approved.
// To re-enable: set NOTIFICATIONS_ENABLED = true at the top of this file,
// then uncomment the WA_API_URL / WA_TOKEN / WA_CHANNEL_ID lines above.
// ---------------------------------------------------------------
async function checkAndNotify() {
  if (!NOTIFICATIONS_ENABLED) {
    console.log('[Notify] Notifications disabled — skipping (set NOTIFICATIONS_ENABLED = true to activate)');
    return;
  }
  console.log('[Notify] Checking for race-weekend notifications...');

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat

  // Only send on Thursday or Friday before the weekend
  if (dayOfWeek !== 4 && dayOfWeek !== 5) {
    console.log('[Notify] Not a Thursday/Friday — skipping notification check');
    return;
  }

  // Find races happening this Saturday or Sunday
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
    const emoji = race.type === 'IRONMAN' ? '🏊🚴🏃' : '⚡';
    const message = `${emoji} *Race Weekend Alert!*\n\n` +
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
  // Uncomment the WA_* config lines at the top of this file before using this.
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
      race_id: raceId,
      channel: 'whatsapp',
      message,
      status: 'sent',
    });

    console.log('[Notify] WhatsApp message sent for race:', raceId);
  } catch (err) {
    console.error('[Notify] WhatsApp send failed:', err.message);
    await supabase.from('notification_log').insert({
      race_id: raceId,
      channel: 'whatsapp',
      message,
      status: 'failed',
    });
  }
}

// ---------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------
async function main() {
  console.log('=== TriTeam Scraper/Notifier ===', new Date().toISOString());

  try {
    // 1. Scrape races — fall back to hardcoded list if scrape returns nothing
    let races = await scrapeIronmanRaces();
    if (races.length === 0) races = getHardcodedRaces();
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
