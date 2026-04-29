# ThatTriathlonLife — Team Dashboard

A private, invite-only race tracking and team coordination platform for ThatTriathlonLife athletes. Built to replace WhatsApp race planning and group chats with a purpose-built tool that automatically tracks IRONMAN, 70.3, and triathlon events worldwide.

---

## What It Does

**Home** — Greets each athlete by name and shows who on the team is racing this week, which races they're in, and where in the world they are on an interactive map. Race rows expand to show all entered athletes.

**Races** — A live calendar of upcoming IRONMAN, 70.3, Olympic, Sprint and other triathlon events pulled automatically from global race databases. Filter by organisation and race type, or search by name, location or type. Toggle between All Races and My Races. Click any race to see the course profile (swim/bike/run), teammates entered, race description, and a direct registration link. Enter or withdraw in one tap. Clicking "Discuss This Race" auto-creates a dedicated channel in Messages.

**Calendar** — Full year view of all upcoming races colour-coded by type.

**Team** — Roster of all active team members and their race entries.

**Training** — Team training feed powered by Strava. Activities sync automatically every hour via GitHub Actions and are served instantly from Supabase — no live Strava API calls at page load. Features include a weekly team summary (swim/bike/run totals), weekly leaderboard (score = sessions × 10 + hours × 5), weekly training streaks, peak week callouts, monthly team recap, and per-activity race countdown badges. Activity cards show available metrics conditionally — pace, power (watts + normalized power), cadence, heart rate, suffer score, PR count, and kudos — only displaying fields the athlete has made public on Strava. Athletes can trigger an immediate manual sync with the Refresh button. Responsive two-column layout on desktop, single column on mobile.

**Messages** — Built-in team messaging replacing WhatsApp. Channels are grouped into General, Training, Groups, and Regions — mirroring the existing WhatsApp group structure — plus Race Threads auto-created when athletes discuss a race. The Announcements channel is admin-only. Supports text, image sharing, emoji reactions, Discord-style replies with quoted context, @mentions with a dedicated Mentions view and unread badge, and message editing. Messages are real-time via Supabase subscriptions with optimistic UI for instant feedback. Sections are collapsible to keep the sidebar clean.

**Discounts** — Partner discount codes managed by admins in-app. Shows brand logo, discount amount, copy-to-clipboard code button, expiry countdown, and single-use/rolling offer badges. Expired discounts auto-archive. No code deploy needed to add or update discounts.

**Profile** — Upload a profile photo, pick an avatar colour, update your name and WhatsApp number, view your personal race schedule grouped by month with days-to-go countdown, and export your schedule to Google Calendar or Apple Calendar (.ics). Sign out from here.

---

## Navigation

On desktop the app uses a top navigation bar. On mobile it switches to a bottom tab bar: Home, Races, Training, Messages, Discounts, Profile.

---

## Access

Invite-only. Contact your team admin to request access. You'll receive a magic link by email — click it to sign in, no password needed. On first login you'll be asked for your name.

---

## Architecture

```
Frontend (React + Vite)  ←→  Supabase (Auth + PostgreSQL + Storage + Realtime)
        ↕                              ↑
Vercel Serverless Fns          GitHub Actions
  /api/race-details              ├── Race scraper (6am UTC daily)
  /api/strava/callback           └── Strava sync (every hour) → calls /api/strava/sync
  /api/strava/refresh
  /api/strava/sync               ← Vercel serverless fn, called by GitHub Actions
  /api/strava/disconnect
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router |
| Backend / Auth / DB | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Hosting | Vercel |
| Race Data | triathlon.org API, PTO Race Calendar (scraped) |
| Race Details | Vercel Serverless Function (`/api/race-details`) |
| Training Data | Strava API (synced to Supabase hourly) |
| Geocoding | OpenStreetMap Nominatim |
| Map | OpenStreetMap Embed |
| Scraper Runtime | GitHub Actions (cron) |
| Notifications | Meta WhatsApp Cloud API *(disabled — pending Meta Business approval)* |

---

## Repository Structure

```
/
├── frontend/                       # React + Vite web app
│   ├── api/
│   │   ├── race-details.js         # Course profile from IRONMAN page
│   │   └── strava/
│   │       ├── callback.js         # OAuth callback — exchanges code for tokens
│   │       ├── refresh.js          # Manual sync trigger for one user
│   │       ├── sync.js             # Full-team hourly sync — called by GitHub Actions
│   │       └── disconnect.js       # Remove Strava tokens from profile
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx            # Landing page — this week's races + map
│   │   │   ├── Dashboard.jsx       # Race list with filters, search, My Races toggle
│   │   │   ├── Training.jsx        # Strava training feed + social features
│   │   │   ├── Messaging.jsx       # Team messaging — channels, replies, @mentions
│   │   │   ├── Discounts.jsx       # Partner discounts with admin management
│   │   │   ├── ProfilePage.jsx     # Profile settings + personal race schedule
│   │   │   ├── Login.jsx           # Magic link auth
│   │   │   └── CompleteProfile.jsx # First-login onboarding
│   │   ├── components/
│   │   │   ├── Layout.jsx          # Responsive nav — top bar (desktop) / bottom tabs (mobile)
│   │   │   ├── RaceList.jsx        # Race rows with entry toggle
│   │   │   ├── RaceDetail.jsx      # Bottom sheet — course info, teammates, discuss button
│   │   │   ├── CalendarView.jsx
│   │   │   ├── TeamRoster.jsx
│   │   │   ├── AddRaceModal.jsx
│   │   │   └── InviteModal.jsx
│   │   └── lib/
│   │       └── supabase.js
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
├── backend/
│   ├── scraper.js                  # Race scraper + race channel cleanup
│   ├── strava-sync.js              # Legacy sync script (kept for manual runs)
│   └── package.json
├── supabase/
│   └── schema.sql
├── .github/
│   └── workflows/
│       ├── scrape-races.yml        # Race scraper (6am UTC daily)
│       └── strava-sync.yml         # Calls /api/strava/sync every hour
├── .env.example
├── FLUTTER_INTEGRATION.md
└── README.md
```

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- A Supabase project (free at supabase.com)
- A Strava API application (free at strava.com/settings/api)
- Git

### 1. Clone the repo
```bash
git clone https://github.com/ThatTriathlonLife/team-ttl-dashboard
cd team-ttl-dashboard
```

### 2. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor
3. Enable magic link auth: Authentication → Providers → Email
4. Set Site URL to `http://localhost:5173`
5. Add `http://localhost:5173/**` to Redirect URLs

### 3. Configure environment variables
```bash
cd frontend
copy .env.example .env.local
```
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_STRAVA_CLIENT_ID=your-strava-client-id
```

### 4. Run the frontend
```bash
npm install
npm run dev
```

### 5. Make yourself admin
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

---

## Deployment

### Frontend → Vercel

```bash
cd frontend
vercel --prod
```

Required environment variables in Vercel dashboard:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_STRAVA_CLIENT_ID` | Strava app Client ID (used in OAuth URL) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (used in serverless functions) |
| `STRAVA_CLIENT_ID` | Strava app Client ID |
| `STRAVA_CLIENT_SECRET` | Strava app Client Secret |
| `CRON_SECRET` | Random secret — authenticates GitHub Actions → `/api/strava/sync` calls |

### GitHub Actions

Two separate workflow files handle the two scheduled jobs. Add these secrets to your repo (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `TRIATHLON_API_KEY` | triathlon.org API key |
| `STRAVA_CLIENT_ID` | Strava app Client ID |
| `STRAVA_CLIENT_SECRET` | Strava app Client Secret |
| `CRON_SECRET` | Same value as Vercel `CRON_SECRET` — sent as Bearer token to `/api/strava/sync` |
| `WHATSAPP_TOKEN` | Meta system user token *(disabled)* |
| `WHATSAPP_PHONE_ID` | Meta phone number ID *(disabled)* |
| `WHATSAPP_CHANNEL_ID` | WhatsApp channel ID *(disabled)* |

The race scraper runs at 6am UTC daily. The Strava sync runs every hour via GitHub Actions calling `/api/strava/sync` — this avoids Vercel Hobby plan cron limitations. Both can be triggered manually via GitHub → Actions → Run workflow.

> **Why GitHub Actions calls Vercel instead of running Node directly:** Vercel Hobby plan only supports once-daily cron jobs. GitHub Actions handles the hourly schedule and calls the Vercel serverless function, which does the actual sync work. This keeps all Strava logic in one place (`/api/strava/sync.js`) and makes both manual and scheduled runs use identical code paths.

---

## Database Schema

| Table | Description |
|-------|-------------|
| `profiles` | Team members — name, email, avatar, role, WhatsApp, Strava tokens, streak data |
| `races` | All races — name, type, date, location, coordinates, source, URL |
| `race_entries` | Which athlete is entered in which race |
| `channels` | Messaging channels — type, category (general/training/regions/interest/race), is_readonly, sort_order |
| `messages` | Messages — content, image URL, reply_to, edited_at |
| `message_reactions` | Emoji reactions on messages |
| `message_mentions` | @mention tracking per message |
| `channel_reads` | Last-read timestamps per user per channel |
| `discounts` | Partner discount codes — brand, code, amount, expiry, logo |
| `strava_activities` | Strava activity feed — 14-day rolling window, pruned hourly. Extended fields: power, speed, cadence, suffer score, PR count, kudos |
| `notification_log` | WhatsApp notification log — admin-only via RLS |

### Key RLS Note
The `message_mentions` SELECT policy must be:
```sql
CREATE POLICY "Read own mentions" ON message_mentions
  FOR SELECT USING (auth.uid() = mentioned_user_id);
```

### Performance
Unread message count uses a Postgres function for a single round trip:
```sql
CREATE OR REPLACE FUNCTION get_unread_counts(p_user_id uuid)
RETURNS TABLE(channel_id uuid, unread_count int) LANGUAGE sql STABLE AS $$
  SELECT
    c.id AS channel_id,
    COUNT(m.id)::int AS unread_count
  FROM channels c
  LEFT JOIN channel_reads cr ON cr.channel_id = c.id AND cr.athlete_id = p_user_id
  LEFT JOIN messages m ON m.channel_id = c.id
    AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
  GROUP BY c.id
$$;
```

---

## Strava Integration

Athletes connect Strava via OAuth from the Training page. Tokens are stored on their profile row in `profiles`.

### Sync Strategy

The sync function (`/api/strava/sync.js`) runs every hour, triggered by GitHub Actions. It handles two distinct cases per athlete:

**First connect — Bootstrap**
On first connect, `strava_bootstrap_status` is set to `pending`. The next hourly sync detects this and performs a one-time historical walk-back: activities are fetched in reverse chronological order until a gap in weekly training is found. This computes the athlete's correct streak from their full Strava history without storing it — only the last 14 days of activities are written to `strava_activities`. The streak count is written to `profiles`. Bootstrap status then flips to `complete`.

If Strava rate-limits mid-bootstrap, the status resets to `pending` and retries on the next hourly run. The Training page shows "Calculating streak..." for any athlete whose bootstrap is pending, polling every 30 seconds until it completes.

**Subsequent syncs — Incremental**
Once bootstrapped, each hourly run fetches only the last 2 days of activities (a 2-day buffer ensures a single missed run never breaks a streak), upserts them to `strava_activities`, prunes activities older than 14 days, and updates the streak counters on `profiles`.

### What Is Stored

| Data | Storage |
|------|---------|
| Activity feed | `strava_activities` — 14-day rolling window, pruned each sync |
| Weekly streak (current) | `profiles.training_streak_current` — integer, updated each sync |
| Weekly streak (longest) | `profiles.training_streak_longest` — integer, updated each sync |
| Historical activities | Never stored — fetched during bootstrap, used to compute streak, discarded |

### Activity Fields Synced

Standard fields (always present): `name`, `sport_type`, `start_date`, `distance`, `moving_time`, `elapsed_time`, `total_elevation_gain`

Privacy-dependent fields (null if athlete has hidden them in Strava): `average_heartrate`, `max_heartrate`, `average_speed`, `average_watts`, `weighted_average_watts`, `average_cadence`, `suffer_score`, `map_summary_polyline`

Social fields: `kudos_count`, `pr_count`, `achievement_count`

The Training page renders all fields conditionally — stats only appear if the value is non-null, so privacy settings are respected automatically without any special handling.

### Streak Calculation

Streaks are measured in **weeks**, matching Strava's own streak display. A week is active if the athlete logged at least one activity. The streak must include the current week or last week to be considered live — otherwise it resets to zero.

The Training page reads `training_streak_current` directly from `profiles` — no client-side streak computation from the feed.

### Strava App Setup
1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create an app — set Authorization Callback Domain to your Vercel domain
3. Add Client ID and Client Secret to Vercel and GitHub secrets

---

## Messaging Architecture

- **Channel categories** — General, Training, Groups, Regions, Race Threads. Seeded to match existing WhatsApp group structure
- **Announcements** — `is_readonly = true`, only admins can post, enforced at DB policy level
- **Collapsible sections** — sidebar groups collapse/expand, defaulting to General open
- **Channel icons** — colour-coded letter avatars per category (teal = General, amber = Training, purple = Groups, blue = Regions, orange = Race Threads)
- **Real-time** — Supabase WebSocket subscriptions
- **Optimistic UI** — messages appear at 50% opacity with "Sending..." label, confirmed on DB insert
- **Deduplication** — subscription skips messages already added optimistically
- **Replies** — Discord-style with quoted parent message
- **@mentions** — matched against profile names, stored in `message_mentions`, surfaced in Mentions view with pink badge
- **Edits** — inline edit on hover for own messages, marked with `(edited)` label
- **Race threads** — auto-created on "Discuss This Race", auto-deleted 14 days post-race
- **Unread badge** — calculated via single Postgres RPC call (`get_unread_counts`), collapsed sections show aggregate badge

---

## Race Data Sources

| Source | Coverage | Method |
|--------|----------|--------|
| triathlon.org API | Olympic, Sprint, World Tri Series | API |
| PTO Race Calendar | IRONMAN Full, 70.3 | Web scraping |

Race channels (created when athletes discuss a race) auto-delete 14 days after the race date.

---

## Roadmap

### Planned
- Race history (past races)
- Leaderboard
- Admin member management
- CSV race import

### Parked
- WhatsApp notifications *(pending Meta Business approval)*
- Mobile app integration *(see FLUTTER_INTEGRATION.md)*

---

## Contributing

Private team project. Open an issue or contact the team admin for bugs and feature requests.

---

*Built for ThatTriathlonLife — Train smart, race hard, finish strong.* 🤘
