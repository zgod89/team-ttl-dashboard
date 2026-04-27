/**
 * Vercel Serverless Function — /api/strava/callback
 * Handles the OAuth callback from Strava after user authorises.
 * Exchanges the code for tokens and stores them on the user's profile.
 *
 * Flow:
 * 1. User clicks "Connect Strava" → redirected to Strava
 * 2. Strava redirects back to /api/strava/callback?code=xxx&state=userId
 * 3. This function exchanges code for tokens
 * 4. Tokens stored in profiles table
 * 5. User redirected back to /training
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key — can write to any profile
)

export default async function handler(req, res) {
  const { code, state: userId, error } = req.query

  if (error) {
    console.error('[Strava OAuth] User denied access:', error)
    return res.redirect('/training?error=denied')
  }

  if (!code || !userId) {
    return res.redirect('/training?error=missing_params')
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('[Strava OAuth] Token exchange failed:', err)
      return res.redirect('/training?error=token_exchange')
    }

    const tokenData = await tokenRes.json()

    // Store tokens on profile
    const { error: dbError } = await supabase.from('profiles').update({
      strava_athlete_id: tokenData.athlete.id,
      strava_access_token: tokenData.access_token,
      strava_refresh_token: tokenData.refresh_token,
      strava_token_expires_at: tokenData.expires_at,
    }).eq('id', userId)

    if (dbError) {
      console.error('[Strava OAuth] Failed to store tokens:', dbError.message)
      return res.redirect('/training?error=db')
    }

    console.log(`[Strava OAuth] Connected athlete ${tokenData.athlete.id} to user ${userId}`)
    return res.redirect('/training?connected=true')

  } catch (err) {
    console.error('[Strava OAuth] Unexpected error:', err.message)
    return res.redirect('/training?error=unknown')
  }
}
