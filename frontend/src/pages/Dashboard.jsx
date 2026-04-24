import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import RaceList from '../components/RaceList'
import TeamRoster from '../components/TeamRoster'
import CalendarView from '../components/CalendarView'
import AddRaceModal from '../components/AddRaceModal'
import InviteModal from '../components/InviteModal'

const S = {
  page: { maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' },
  tabBar: { display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  tab: { padding: '12px 20px', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase', color: '#888', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s', marginBottom: '-1px' },
  tabActive: { color: '#00C4B4', borderBottomColor: '#00C4B4' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '1.5rem' },
  statCard: { background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1rem 1.25rem' },
  statLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: '6px' },
  statValue: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '32px', fontWeight: 700, lineHeight: 1 },
  statSub: { fontSize: '12px', color: '#999', marginTop: '4px' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' },
  sectionTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase', color: '#555' },
  sectionTitleSpan: { color: '#fff' },
  btnGhost: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '8px 16px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: '#ccc', cursor: 'pointer', transition: 'all 0.15s' },
  filters: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' },
  filterBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', padding: '5px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', color: '#555', cursor: 'pointer', transition: 'all 0.15s' },
  filterBtnActive: { border: '1px solid rgba(0,196,180,0.5)', color: '#00C4B4', background: 'rgba(0,196,180,0.08)' },
  filterDivider: { width: '1px', background: 'rgba(255,255,255,0.08)', height: '20px', margin: '0 4px' },
  filterLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#333', marginRight: '2px' },
  searchWrap: { position: 'relative', marginBottom: '10px' },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: '15px', pointerEvents: 'none' },
  searchInput: { width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', padding: '10px 36px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', outline: 'none', transition: 'border-color 0.15s' },
  searchClear: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#555', fontSize: '16px', cursor: 'pointer', padding: '2px 4px', lineHeight: 1 },
  searchResults: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '1px', color: '#555', marginBottom: '8px' },
  // My Races toggle
  viewToggle: { display: 'flex', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '2px', marginBottom: '1rem', width: 'fit-content' },
  viewBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', padding: '6px 16px', background: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s', color: '#555' },
  viewBtnActive: { background: '#00C4B4', color: '#000', fontWeight: 600 },
}

const TABS = ['Races', 'Calendar', 'Team']
const ORG_OPTIONS = [{ value: 'all', label: 'All' }, { value: 'pto_scrape', label: 'IRONMAN' }, { value: 'triathlon_api', label: 'World Tri' }, { value: 'manual', label: 'Manual' }]
const TYPE_OPTIONS = [{ value: 'all', label: 'All Types' }, { value: 'IRONMAN', label: 'Full' }, { value: '70.3', label: '70.3' }, { value: 'Olympic', label: 'Olympic' }, { value: 'Sprint', label: 'Sprint' }, { value: 'Other', label: 'Other' }]

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
  const [orgFilter, setOrgFilter] = useState('pto_scrape')
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('all') // 'all' | 'mine'

  const userId = session.user.id

  useEffect(() => { loadAll() }, [])

  async function ensureProfile() {
    const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).single()
    if (!existing) {
      const email = session.user.email
      const fullName = session.user.user_metadata?.full_name || email.split('@')[0]
      await supabase.from('profiles').insert({ id: userId, full_name: fullName, email, role: 'athlete' })
    }
  }

  async function loadAll() {
    setLoading(true)
    await ensureProfile()
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
    if (!error && data) setRaces(prev => [...prev, data].sort((a, b) => new Date(a.race_date) - new Date(b.race_date)))
    setShowAddRace(false)
  }

  const filteredRaces = races.filter(r => {
    const orgMatch = orgFilter === 'all' || r.source === orgFilter
    const typeMatch = typeFilter === 'all' || r.type === typeFilter
    const q = searchQuery.toLowerCase().trim()
    const searchMatch = !q || r.name?.toLowerCase().includes(q) || r.location?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || r.country?.toLowerCase().includes(q) || r.type?.toLowerCase().includes(q)
    const mineMatch = viewMode === 'all' || myEntries.includes(r.id)
    return orgMatch && typeMatch && searchMatch && mineMatch
  })

  const myRaceCount = myEntries.length
  const nextRace = races.find(r => myEntries.includes(r.id))
  const daysToNext = nextRace ? Math.ceil((new Date(nextRace.race_date) - new Date()) / 86400000) : null

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Barlow Condensed', letterSpacing: 2, color: '#555', textTransform: 'uppercase' }}>Loading...</div>

  return (
    <div style={S.page}>
      <div style={S.statsRow}>
        <div style={S.statCard}>
          <div style={S.statLabel}>Total Races</div>
          <div style={{ ...S.statValue, color: '#00C4B4' }}>{filteredRaces.length}</div>
          <div style={S.statSub}>matching filters</div>
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
          <div style={S.statSub}>{nextRace ? nextRace.name.replace(/ironman\s+70\.3\s+/i, '').replace(/ironman\s+/i, '') : 'No races entered'}</div>
        </div>
      </div>

      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Races' && (
        <>
          <div style={S.sectionHead}>
            <div style={S.sectionTitle}>Upcoming <span style={S.sectionTitleSpan}>Races</span></div>
            <button style={S.btnGhost} onClick={() => setShowAddRace(true)}>+ Add Race</button>
          </div>

          {/* All / My Races toggle */}
          <div style={S.viewToggle}>
            <button style={{ ...S.viewBtn, ...(viewMode === 'all' ? S.viewBtnActive : {}) }} onClick={() => setViewMode('all')}>All Races</button>
            <button style={{ ...S.viewBtn, ...(viewMode === 'mine' ? S.viewBtnActive : {}) }} onClick={() => setViewMode('mine')}>
              My Races {myRaceCount > 0 ? `(${myRaceCount})` : ''}
            </button>
          </div>

          {/* Search */}
          <div style={S.searchWrap}>
            <span style={S.searchIcon}>🔍</span>
            <input style={S.searchInput} type="text" placeholder="Search by name, location or type..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && <button style={S.searchClear} onClick={() => setSearchQuery('')}>×</button>}
          </div>
          {searchQuery && <div style={S.searchResults}>{filteredRaces.length} result{filteredRaces.length !== 1 ? 's' : ''} for "{searchQuery}"</div>}

          {/* Filters */}
          <div style={S.filters}>
            <span style={S.filterLabel}>Org</span>
            {ORG_OPTIONS.map(o => (
              <button key={o.value} style={{ ...S.filterBtn, ...(orgFilter === o.value ? S.filterBtnActive : {}) }} onClick={() => setOrgFilter(o.value)}>{o.label}</button>
            ))}
            <div style={S.filterDivider} />
            <span style={S.filterLabel}>Type</span>
            {TYPE_OPTIONS.map(o => (
              <button key={o.value} style={{ ...S.filterBtn, ...(typeFilter === o.value ? S.filterBtnActive : {}) }} onClick={() => setTypeFilter(o.value)}>{o.label}</button>
            ))}
          </div>

          {viewMode === 'mine' && myRaceCount === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: '#161616', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏊</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: '8px' }}>No races entered yet</div>
              <div style={{ fontSize: '13px', color: '#999' }}>Switch to All Races and hit Enter on any race to add it here.</div>
            </div>
          ) : (
            <RaceList races={filteredRaces} myEntries={myEntries} allEntries={allEntries} profiles={profiles} onToggle={toggleEntry} session={session} />
          )}
        </>
      )}

      {tab === 'Calendar' && <CalendarView races={filteredRaces} myEntries={myEntries} />}

      {tab === 'Team' && (
        <>
          <div style={S.sectionHead}>
            <div style={S.sectionTitle}>Team <span style={S.sectionTitleSpan}>Members</span></div>
            {profile?.role === 'admin' && <button style={S.btnGhost} onClick={() => setShowInvite(true)}>+ Invite Member</button>}
          </div>
          <TeamRoster profiles={profiles} allEntries={allEntries} races={races} />
        </>
      )}

      {showAddRace && <AddRaceModal onAdd={addRace} onClose={() => setShowAddRace(false)} />}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
