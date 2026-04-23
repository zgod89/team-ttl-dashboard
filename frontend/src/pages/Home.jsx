import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

function getWeekRange() {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  }
}

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// Render an OpenStreetMap iframe centred on the race location
function RaceMap({ races }) {
  const racesWithCoords = races.filter(r => r.latitude && r.longitude)

  if (racesWithCoords.length === 0) {
    return (
      <div style={{
        background: '#161616',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        height: '340px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '12px',
      }}>
        <div style={{ fontSize: '32px' }}>🗺️</div>
        <div style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontSize: '14px', letterSpacing: '2px',
          textTransform: 'uppercase', color: '#555',
        }}>
          No location data for this week's races
        </div>
      </div>
    )
  }

  // If one race — centre on it. If multiple — use midpoint
  const avgLat = racesWithCoords.reduce((s, r) => s + r.latitude, 0) / racesWithCoords.length
  const avgLon = racesWithCoords.reduce((s, r) => s + r.longitude, 0) / racesWithCoords.length
  const zoom = racesWithCoords.length === 1 ? 10 : 4

  // Build marker string for each race location
  const markers = racesWithCoords.map(r =>
    `marker=${r.latitude},${r.longitude}`
  ).join('&')

  // Use OpenStreetMap embed (no API key needed)
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${avgLon - 3},${avgLat - 2},${avgLon + 3},${avgLat + 2}&layer=mapnik&${markers}`

  return (
    <div style={{
      borderRadius: '12px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
      position: 'relative',
    }}>
      {/* Race location labels above the map */}
      <div style={{
        background: '#161616',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '10px 16px',
        display: 'flex', gap: '16px', flexWrap: 'wrap',
      }}>
        {racesWithCoords.map(race => (
          <div key={race.id} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '13px', color: '#ccc',
            fontFamily: 'Barlow Condensed, sans-serif',
            letterSpacing: '0.5px',
          }}>
            <span style={{ color: '#00C4B4', fontSize: '16px' }}>📍</span>
            <span style={{ fontWeight: 600, color: '#fff' }}>{race.city || race.location}</span>
            <span style={{ color: '#999' }}>— {race.name}</span>
          </div>
        ))}
      </div>
      <iframe
        title="Race locations"
        src={src}
        style={{ width: '100%', height: '320px', border: 'none', display: 'block' }}
        loading="lazy"
      />
      <div style={{
        position: 'absolute', bottom: '8px', right: '8px',
        background: 'rgba(0,0,0,0.6)',
        borderRadius: '4px', padding: '3px 8px',
        fontSize: '10px', color: '#999',
        fontFamily: 'Barlow, sans-serif',
      }}>
        © OpenStreetMap contributors
      </div>
    </div>
  )
}

export default function Home({ session }) {
  const [weekRaces, setWeekRaces] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadWeek() }, [])

  async function ensureProfile() {
    const userId = session.user.id
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('id', userId).single()
    if (!existing) {
      const email = session.user.email
      const fullName = session.user.user_metadata?.full_name || email.split('@')[0]
      const { error } = await supabase.from('profiles').insert({
        id: userId, full_name: fullName, email, role: 'athlete',
      })
      if (error) console.error('[ensureProfile] Failed to create profile:', error.message)
    }
  }

  async function loadWeek() {
    const { start, end } = getWeekRange()
    const userId = session.user.id
    await ensureProfile()

    const [racesRes, profileRes] = await Promise.all([
      supabase
        .from('races')
        .select(`*, race_entries(athlete_id, profiles(full_name, id))`)
        .gte('race_date', start)
        .lte('race_date', end)
        .order('race_date'),
      supabase.from('profiles').select('*').eq('id', userId).single(),
    ])

    if (racesRes.data) {
      setWeekRaces(racesRes.data.filter(r => r.race_entries?.length > 0))
    }
    if (profileRes.data) setProfile(profileRes.data)
    setLoading(false)
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'Athlete'
  const totalRacers = [...new Set(
    weekRaces.flatMap(r => r.race_entries.map(e => e.athlete_id))
  )].length

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Barlow Condensed', letterSpacing: 2, color: '#999', textTransform: 'uppercase' }}>
      Loading...
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2.5rem 1.5rem' }}>

      {/* Greeting */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontSize: '13px', letterSpacing: '3px',
          textTransform: 'uppercase', color: '#999', marginBottom: '8px',
        }}>
          {greeting()},
        </div>
        <h1 style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontSize: '52px', fontWeight: 900,
          letterSpacing: '2px', lineHeight: 1, color: '#fff',
        }}>
          {firstName.toUpperCase()}
        </h1>
        <div style={{
          width: '60px', height: '3px', marginTop: '12px',
          background: 'linear-gradient(90deg, #00C4B4, #FF3D8B)',
          borderRadius: '2px',
        }} />
      </div>

      {weekRaces.length === 0 ? (
        /* No races this week */
        <div style={{
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '3rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🤙</div>
          <div style={{
            fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '20px', fontWeight: 700,
            letterSpacing: '2px', textTransform: 'uppercase',
            color: '#fff', marginBottom: '8px',
          }}>
            No races this week
          </div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            Train hard — race weekend is coming.
          </div>
        </div>
      ) : (
        <>
          {/* 1 — This Week summary */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,196,180,0.06) 0%, rgba(255,61,139,0.06) 100%)',
            border: '1px solid rgba(0,196,180,0.2)',
            borderRadius: '12px',
            padding: '1.75rem 2rem',
            marginBottom: '1.25rem',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
              background: 'linear-gradient(90deg, #00C4B4, #FF3D8B, #E8B84B, #FF5A1F)',
            }} />
            <div style={{
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: '12px', letterSpacing: '3px',
              textTransform: 'uppercase', color: '#00C4B4', marginBottom: '10px',
            }}>
              This week
            </div>
            <div style={{
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: '28px', fontWeight: 800,
              letterSpacing: '1px', color: '#fff',
              lineHeight: 1.2, marginBottom: '16px',
            }}>
              {totalRacers === 1
                ? `1 teammate is racing this week 🏁`
                : `${totalRacers} teammates are racing this week 🏁`
              }
            </div>
            <div style={{ fontSize: '14px', color: '#bbb', lineHeight: 1.7 }}>
              {weekRaces.map(race => {
                const names = race.race_entries.map(e => e.profiles?.full_name).filter(Boolean)
                return (
                  <div key={race.id} style={{ marginBottom: '4px' }}>
                    <span style={{ color: '#fff', fontWeight: 500 }}>{names.join(', ')}</span>
                    {' '}— {race.name} on {getDayName(race.race_date)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 2 — Good luck message */}
          <div style={{
            background: '#161616',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            padding: '1.25rem 1.75rem',
            display: 'flex', alignItems: 'center', gap: '16px',
            marginBottom: '1.25rem',
          }}>
            <div style={{ fontSize: '28px', flexShrink: 0 }}>🤘</div>
            <div>
              <div style={{
                fontFamily: 'Barlow Condensed, sans-serif',
                fontSize: '18px', fontWeight: 700,
                letterSpacing: '1px', color: '#fff', marginBottom: '3px',
              }}>
                Good luck out there, Team TTL!
              </div>
              <div style={{ fontSize: '13px', color: '#aaa' }}>
                Have fun, race hard, and finish strong. The whole team is cheering you on!
              </div>
            </div>
          </div>

          {/* 3 — Map */}
          <RaceMap races={weekRaces} />
        </>
      )}
    </div>
  )
}
