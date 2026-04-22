import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MEMBER_COLORS = ['#00C4B4','#FF3D8B','#E8B84B','#FF5A1F','#a78bfa','#34d399','#f472b6','#60a5fa']

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

export default function Home({ session }) {
  const [weekRaces, setWeekRaces] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadWeek() }, [])

  async function loadWeek() {
    const { start, end } = getWeekRange()
    const userId = session.user.id

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
      // Only include races that have at least one entry
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
          textTransform: 'uppercase', color: '#999',
          marginBottom: '8px',
        }}>
          {greeting()},
        </div>
        <h1 style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontSize: '52px', fontWeight: 900,
          letterSpacing: '2px', lineHeight: 1,
          color: '#fff', marginBottom: '0',
        }}>
          {firstName.toUpperCase()}
        </h1>
        <div style={{
          width: '60px', height: '3px', marginTop: '12px',
          background: 'linear-gradient(90deg, #00C4B4, #FF3D8B)',
          borderRadius: '2px',
        }} />
      </div>

      {/* This week section */}
      {weekRaces.length === 0 ? (
        <div style={{
          background: '#161616',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '3rem',
          textAlign: 'center',
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
          {/* Race weekend callout */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,196,180,0.06) 0%, rgba(255,61,139,0.06) 100%)',
            border: '1px solid rgba(0,196,180,0.2)',
            borderRadius: '12px',
            padding: '1.75rem 2rem',
            marginBottom: '1.5rem',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Stripe accent */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
              background: 'linear-gradient(90deg, #00C4B4, #FF3D8B, #E8B84B, #FF5A1F)',
            }} />

            <div style={{
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: '12px', letterSpacing: '3px',
              textTransform: 'uppercase', color: '#00C4B4',
              marginBottom: '10px',
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

          {/* Individual racer cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '12px',
            marginBottom: '2rem',
          }}>
            {weekRaces.flatMap((race, ri) =>
              race.race_entries.map((entry, ei) => {
                const name = entry.profiles?.full_name || 'Athlete'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                const colorIdx = (ri * 4 + ei) % MEMBER_COLORS.length
                const color = MEMBER_COLORS[colorIdx]
                const typeBadge = race.type === 'IRONMAN' ? { bg: 'rgba(0,196,180,0.12)', color: '#00C4B4', border: 'rgba(0,196,180,0.25)' }
                  : race.type === '70.3' ? { bg: 'rgba(255,61,139,0.12)', color: '#FF3D8B', border: 'rgba(255,61,139,0.25)' }
                  : { bg: 'rgba(232,184,75,0.1)', color: '#E8B84B', border: 'rgba(232,184,75,0.2)' }

                return (
                  <div key={`${race.id}-${entry.athlete_id}`} style={{
                    background: '#161616',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderLeft: `3px solid ${color}`,
                    borderRadius: '8px',
                    padding: '1.25rem',
                    display: 'flex', alignItems: 'center', gap: '14px',
                  }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: color, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'Barlow Condensed, sans-serif',
                      fontSize: '16px', fontWeight: 700, color: '#000',
                    }}>
                      {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'Barlow Condensed, sans-serif',
                        fontSize: '16px', fontWeight: 700,
                        color: '#fff', marginBottom: '3px',
                      }}>
                        {name}
                      </div>
                      <div style={{
                        fontSize: '12px', color: '#aaa',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        marginBottom: '6px',
                      }}>
                        {race.name}
                      </div>
                      <span style={{
                        fontFamily: 'Barlow Condensed, sans-serif',
                        fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
                        padding: '2px 8px', borderRadius: '3px',
                        background: typeBadge.bg, color: typeBadge.color,
                        border: `1px solid ${typeBadge.border}`,
                        textTransform: 'uppercase',
                      }}>
                        {race.type}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Good luck message */}
          <div style={{
            background: '#161616',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            padding: '1.5rem 2rem',
            display: 'flex', alignItems: 'center', gap: '16px',
          }}>
            <div style={{ fontSize: '32px', flexShrink: 0 }}>🤘</div>
            <div>
              <div style={{
                fontFamily: 'Barlow Condensed, sans-serif',
                fontSize: '18px', fontWeight: 700,
                letterSpacing: '1px', color: '#fff',
                marginBottom: '4px',
              }}>
                Good luck out there, Team TTL!
              </div>
              <div style={{ fontSize: '13px', color: '#aaa' }}>
                Have fun, race hard, and finish strong. The whole team is cheering you on!
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
