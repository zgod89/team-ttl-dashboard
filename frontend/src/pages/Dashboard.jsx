import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import RaceList from '../components/RaceList'
import TeamRoster from '../components/TeamRoster'
import CalendarView from '../components/CalendarView'
import AddRaceModal from '../components/AddRaceModal'
import InviteModal from '../components/InviteModal'

const S = {
  page: { maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' },
  tabBar: {
    display: 'flex', gap: '0', marginBottom: '2rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  tab: {
    padding: '12px 20px',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase',
    color: '#666', background: 'none', border: 'none',
    borderBottom: '2px solid transparent', cursor: 'pointer',
    transition: 'all 0.15s', marginBottom: '-1px',
  },
  tabActive: { color: '#00C4B4', borderBottomColor: '#00C4B4' },
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px', marginBottom: '1.5rem',
  },
  statCard: {
    background: '#161616', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', padding: '1rem 1.25rem',
  },
  statLabel: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase',
    color: '#555', marginBottom: '6px',
  },
  statValue: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '32px', fontWeight: 700, lineHeight: 1,
  },
  statSub: { fontSize: '12px', color: '#555', marginTop: '4px' },
  sectionHead: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: '1rem',
  },
  sectionTitle: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '13px', letterSpacing: '2px',
    textTransform: 'uppercase', color: '#555',
  },
  sectionTitleSpan: { color: '#fff' },
  btnGhost: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase',
    padding: '8px 16px', background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '4px', color: '#ccc',
    cursor: 'pointer', transition: 'all 0.15s',
  },
  banner: {
    background: 'rgba(0,196,180,0.08)',
    border: '1px solid rgba(0,196,180,0.2)',
    borderLeft: '3px solid #00C4B4',
    borderRadius: '8px', padding: '1rem 1.25rem',
    marginBottom: '1.5rem',
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: '1rem',
  },
  bannerText: { fontSize: '14px', color: '#ccc', flex: 1 },
  bannerClose: {
    background: 'none', border: 'none', color: '#555',
    fontSize: '18px', cursor: 'pointer', padding: '0 4px',
  },
}

const TABS = ['Races', 'Calendar', 'Team']

export default function Dashboard({ session }) {
  const [tab, setTab] = useState('Races')
  const [races, setRaces] = useState([])
  const [myEntries, setMyEntries] = useState([])
  const [allEntries, setAllEntries] = useState([])
  const [profiles, setProfiles] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddRace, setShowAddRace] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [banner, setBanner] = useState(null)

  const userId = session.user.id

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [racesRes, entriesRes, profilesRes, myProfileRes] = await Promise.all([
      supabase.from('races').select('*').gte('race_date', new Date().toISOString().split('T')[0]).order('race_date'),
      supabase.from('race_entries').select('*, profiles(full_name, id)'),
      supabase.from('profiles').select('*'),
      supabase.from('profiles').select('*').eq('id', userId).single(),
    ])
    if (racesRes.data) setRaces(racesRes.data)
    if (entriesRes.data) {
      setAllEntries(entriesRes.data)
      setMyEntries(entriesRes.data.filter(e => e.athlete_id === userId).map(e => e.race_id))
    }
    if (profilesRes.data) setProfiles(profilesRes.data)
    if (myProfileRes.data) setProfile(myProfileRes.data)

    // Check for race weekend alerts
    const today = new Date()
    const daysUntilSat = (6 - today.getDay() + 7) % 7
    if (daysUntilSat <= 2) {
      const sat = new Date(today); sat.setDate(today.getDate() + daysUntilSat)
      const sun = new Date(sat); sun.setDate(sat.getDate() + 1)
      const satStr = sat.toISOString().split('T')[0]
      const sunStr = sun.toISOString().split('T')[0]
      const weekendRaces = racesRes.data?.filter(r => r.race_date === satStr || r.race_date === sunStr) || []
      if (weekendRaces.length > 0) {
        const racersThisWeekend = entriesRes.data?.filter(e => weekendRaces.some(r => r.id === e.race_id)) || []
        const names = [...new Set(racersThisWeekend.map(e => e.profiles?.full_name).filter(Boolean))]
        if (names.length > 0) {
          setBanner(`Race weekend! ${weekendRaces.map(r => r.name).join(' & ')} — ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} racing.`)
        }
      }
    }
    setLoading(false)
  }

  async function toggleEntry(raceId) {
    if (myEntries.includes(raceId)) {
      await supabase.from('race_entries').delete().eq('race_id', raceId).eq('athlete_id', userId)
      setMyEntries(prev => prev.filter(id => id !== raceId))
      setAllEntries(prev => prev.filter(e => !(e.race_id === raceId && e.athlete_id === userId)))
    } else {
      const { data } = await supabase.from('race_entries').insert({ race_id: raceId, athlete_id: userId }).select('*, profiles(full_name, id)').single()
      setMyEntries(prev => [...prev, raceId])
      if (data) setAllEntries(prev => [...prev, data])
    }
  }

  async function addRace(race) {
    const { data, error } = await supabase.from('races').insert(race).select().single()
    if (!error && data) {
      setRaces(prev => [...prev, data].sort((a, b) => new Date(a.race_date) - new Date(b.race_date)))
    }
    setShowAddRace(false)
  }

  const myRaceCount = myEntries.length
  const nextRace = races.find(r => myEntries.includes(r.id))
  const daysToNext = nextRace ? Math.ceil((new Date(nextRace.race_date) - new Date()) / 86400000) : null

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Barlow Condensed', letterSpacing: 2, color: '#555', textTransform: 'uppercase' }}>
      Loading races...
    </div>
  )

  return (
    <div style={S.page}>
      {banner && (
        <div style={S.banner}>
          <div style={S.bannerText}>🏊 <strong style={{ color: '#00C4B4' }}>Race weekend!</strong> {banner}</div>
          <button style={S.bannerClose} onClick={() => setBanner(null)}>×</button>
        </div>
      )}

      {/* Stats */}
      <div style={S.statsRow}>
        <div style={S.statCard}>
          <div style={S.statLabel}>Total Races</div>
          <div style={{ ...S.statValue, color: '#00C4B4' }}>{races.length}</div>
          <div style={S.statSub}>upcoming this season</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statLabel}>My Races</div>
          <div style={{ ...S.statValue, color: '#FF3D8B' }}>{myRaceCount}</div>
          <div style={S.statSub}>entered so far</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statLabel}>Team Members</div>
          <div style={{ ...S.statValue, color: '#E8B84B' }}>{profiles.length}</div>
          <div style={S.statSub}>active athletes</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statLabel}>Next Race</div>
          <div style={{ ...S.statValue, color: '#FF5A1F', fontSize: daysToNext !== null ? '28px' : '18px' }}>
            {daysToNext !== null ? `${daysToNext}d` : '—'}
          </div>
          <div style={S.statSub}>{nextRace ? nextRace.name.replace('Ironman ', '').replace('IRONMAN ', '') : 'No races entered'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button
            key={t}
            style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Races' && (
        <>
          <div style={S.sectionHead}>
            <div style={S.sectionTitle}>Upcoming <span style={S.sectionTitleSpan}>Races</span></div>
            <button style={S.btnGhost} onClick={() => setShowAddRace(true)}>+ Add Race</button>
          </div>
          <RaceList
            races={races}
            myEntries={myEntries}
            allEntries={allEntries}
            profiles={profiles}
            onToggle={toggleEntry}
          />
        </>
      )}

      {tab === 'Calendar' && (
        <CalendarView races={races} myEntries={myEntries} />
      )}

      {tab === 'Team' && (
        <>
          <div style={S.sectionHead}>
            <div style={S.sectionTitle}>Team <span style={S.sectionTitleSpan}>Members</span></div>
            {profile?.role === 'admin' && (
              <button style={S.btnGhost} onClick={() => setShowInvite(true)}>+ Invite Member</button>
            )}
          </div>
          <TeamRoster profiles={profiles} allEntries={allEntries} races={races} />
        </>
      )}

      {showAddRace && <AddRaceModal onAdd={addRace} onClose={() => setShowAddRace(false)} />}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
