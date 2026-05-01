/**
 * Vercel Serverless Function — /api/strava/refresh
 * Triggers an immediate single-athlete sync for the requesting user.
 * Proxies to /api/strava/sync with userId, which runs the full sync pipeline
 * including badge checking, PR celebrations, and challenge progress.
 *
 * POST /api/strava/refresh
 * Body: { userId: string }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  const CRON_SECRET = process.env.CRON_SECRET
  if (!CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET not configured' })

  try {
    const syncUrl = `${process.env.VITE_APP_URL || 'https://' + req.headers.host}/api/strava/sync`

    const syncRes = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ userId }),
    })

    const data = await syncRes.json()

    if (!syncRes.ok) {
      return res.status(syncRes.status).json(data)
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('[Strava Refresh]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
