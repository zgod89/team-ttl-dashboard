import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId } = req.body

  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  const { error } = await supabase.from('profiles').update({
    strava_athlete_id: null,
    strava_access_token: null,
    strava_refresh_token: null,
    strava_token_expires_at: null,
  }).eq('id', userId)

  if (error) {
    console.error('[Strava] Disconnect failed:', error.message)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ success: true })
}
