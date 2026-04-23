# ThatTriathlonLife — Team Dashboard

A private, invite-only race tracking and team coordination platform for ThatTriathlonLife athletes. Built to replace WhatsApp race planning with a purpose-built tool that automatically tracks IRONMAN, 70.3, and triathlon events worldwide.

---

## What It Does

**Home** — Greets each athlete by name and shows who on the team is racing this week, which race they're in, and where in the world it is on an interactive map.

**Races** — A live calendar of upcoming IRONMAN, 70.3, Olympic, Sprint and other triathlon events pulled automatically from global race databases. Filter by organisation and race type. Click any race to see course profile (swim/bike/run), teammates entered, race description, and a direct registration link. Enter or withdraw from races in one tap.

**My Races** — Your personal race schedule for the season, grouped by month with a countdown to your next race. Export your full schedule to Google Calendar or Apple Calendar in one click.

**Calendar** — Full year view of all upcoming races colour-coded by type.

**Team** — Roster of all active team members and their entered races.

**Profile** — Upload a profile photo, pick an avatar colour, and update your contact details.

---

## Access

Invite-only. Contact your team admin to request access. You'll receive a magic link by email — click it to sign in, no password needed. On first login you'll be asked for your name.

---

## Architecture

```
Frontend (React + Vite)  ←→  Supabase (Auth + PostgreSQL)
                                      ↑
                             Node.js Scraper
                             (GitHub Actions, daily 6am UTC)
                                      ↑
                         triathlon.org API + PTO Race Calendar
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router |
| Backend / Auth / DB | Supabase (PostgreSQL + Auth + Storage) |
| Hosting | Vercel |
| Race Data | triathlon.org API, PTO Race Calendar (scraped) |
| Race Details | Vercel Serverless Function (`/api/race-details`) |
| Geocoding | OpenStreetMap Nominatim |
| Map | OpenStreetMap Embed |
| Scraper Runtime | GitHub Actions (daily cron) |
| Notifications | Meta WhatsApp Cloud API *(disabled — pending Meta Business approval)* |

---

## Repository Structure

```
/
├── frontend/                  # React + Vite web app
│   ├── api/
│   │   └── race-details.js    # Vercel serverless function
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx       # Landing page — this week's races
│   │   │   ├── Dashboard.jsx  # Race list with filters
│   │   │   ├── MyRaces.jsx    # Personal race schedule
│   │   │   ├── Login.jsx      # Magic link auth
│   │   │   ├── CompleteProfile.jsx  # First-login onboarding
│   │   │   └── ProfileSettings.jsx  # Profile editing
│   │   ├── components/
│   │   │   ├── Layout.jsx     # Nav + page wrapper
│   │   │   ├── RaceList.jsx   # Race rows with entry toggle
│   │   │   ├── RaceDetail.jsx # Bottom sheet — course info, teammates
│   │   │   ├── CalendarView.jsx
│   │   │   ├── TeamRoster.jsx
│   │   │   ├── AddRaceModal.jsx
│   │   │   └── InviteModal.jsx
│   │   └── lib/
│   │       └── supabase.js    # Supabase client
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
├── backend/
│   ├── scraper.js             # Race scraper + WhatsApp notifier
│   └── package.json
├── supabase/
│   └── schema.sql             # Full database schema
├── .github/
│   └── workflows/
│       └── scrape.yml         # Daily GitHub Actions cron
├── .env.example
└── README.md
```

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- A Supabase project (free at supabase.com)
- Git

### 1. Clone the repo
```bash
git clone https://github.com/ThatTriathlonLife/team-ttl-dashboard
cd team-ttl-dashboard
```

### 2. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `supabase/schema.sql`
3. Go to Authentication → Providers → Email and enable magic links
4. Go to Authentication → URL Configuration and set Site URL to `http://localhost:5173`
5. Add `http://localhost:5173/**` to Redirect URLs

### 3. Configure environment variables
```bash
cd frontend
copy .env.example .env.local
```
Edit `.env.local`:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run the frontend
```bash
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### 5. Make yourself admin
After first login, run this in Supabase SQL Editor:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

---

## Deployment

### Frontend → Vercel
```bash
cd frontend
npm install -g vercel
vercel login
vercel --prod
```
Add environment variables in Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Update Supabase Auth redirect URLs to include your Vercel domain.

### Race Scraper → GitHub Actions
The scraper runs automatically at 6am UTC daily via `.github/workflows/scrape.yml`.

Add these secrets to your GitHub repo (Settings → Secrets → Actions):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `TRIATHLON_API_KEY` *(register free at developers.triathlon.org)*

To trigger manually: GitHub → Actions → Daily Race Scraper → Run workflow.

---

## Environment Variables Reference

| Variable | Used In | Description |
|----------|---------|-------------|
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase public anon key |
| `SUPABASE_URL` | Scraper | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Scraper | Supabase service role key (never expose publicly) |
| `TRIATHLON_API_KEY` | Scraper | triathlon.org API key |
| `WHATSAPP_TOKEN` | Scraper *(disabled)* | Meta system user token |
| `WHATSAPP_PHONE_ID` | Scraper *(disabled)* | Meta phone number ID |
| `WHATSAPP_CHANNEL_ID` | Scraper *(disabled)* | WhatsApp channel/group ID |

---

## Database Schema

Key tables in Supabase:

| Table | Description |
|-------|-------------|
| `profiles` | Team members — name, email, avatar, role, WhatsApp number |
| `races` | All races — name, type, date, location, coordinates, source, registration URL |
| `race_entries` | Junction table — which athlete is entered in which race |
| `notification_log` | Log of WhatsApp notifications sent |

Row Level Security is enabled. Users can only modify their own data. Race data is readable by all authenticated users.

---

## Race Data Sources

| Source | Coverage | Method |
|--------|----------|--------|
| triathlon.org API | Olympic, Sprint, World Tri Series | API (free, key required) |
| PTO Race Calendar | IRONMAN Full, 70.3 | Web scraping (cheerio) |

Races are upserted daily — existing entries are preserved when race details update.

---

## Roadmap

### In Progress / Planned
- Race search
- Race history (past races)
- Leaderboard
- Comments / reactions on races
- Built-in team messaging (WhatsApp replacement)
- Admin member management
- CSV race import

### Parked
- WhatsApp notifications *(requires Meta Business account approval)*
- Mobile app integration *(pending review of existing app stack)*

---

## Contributing

This is a private team project. To report bugs or request features, open an issue in this repository or contact the team admin.

---

*Built for ThatTriathlonLife — Train smart, race hard, finish strong.* 🤘
