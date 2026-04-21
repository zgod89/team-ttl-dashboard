const MEMBER_COLORS = ['#00C4B4','#FF3D8B','#E8B84B','#FF5A1F','#a78bfa','#34d399','#f472b6','#60a5fa']

const S = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px',
  },
  card: {
    background: '#161616',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '1.25rem',
    textAlign: 'center',
  },
  avatar: {
    width: '52px', height: '52px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '18px', fontWeight: 700, color: '#000',
    margin: '0 auto 10px',
  },
  name: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '16px', fontWeight: 600, color: '#fff',
  },
  raceCount: { fontSize: '12px', color: '#555', marginTop: '4px' },
  tags: {
    display: 'flex', flexWrap: 'wrap', gap: '4px',
    justifyContent: 'center', marginTop: '10px',
  },
  tag: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '10px', letterSpacing: '0.5px',
    padding: '2px 8px', borderRadius: '3px',
  },
  tagFull: { background: 'rgba(0,196,180,0.12)', color: '#00C4B4', border: '1px solid rgba(0,196,180,0.2)' },
  tag703: { background: 'rgba(255,61,139,0.12)', color: '#FF3D8B', border: '1px solid rgba(255,61,139,0.2)' },
  tagOther: { background: 'rgba(232,184,75,0.1)', color: '#E8B84B', border: '1px solid rgba(232,184,75,0.2)' },
  role: {
    display: 'inline-block',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase',
    padding: '2px 8px', borderRadius: '3px',
    background: 'rgba(255,255,255,0.05)',
    color: '#555', marginTop: '6px',
  },
  empty: {
    textAlign: 'center', padding: '3rem',
    fontFamily: 'Barlow Condensed, sans-serif',
    letterSpacing: '2px', color: '#444',
    textTransform: 'uppercase', fontSize: '14px',
  },
}

export default function TeamRoster({ profiles, allEntries, races }) {
  if (profiles.length === 0) return <div style={S.empty}>No team members yet</div>

  return (
    <div style={S.grid}>
      {profiles.map((member, idx) => {
        const memberEntries = allEntries.filter(e => e.athlete_id === member.id)
        const memberRaces = memberEntries.map(e => races.find(r => r.id === e.race_id)).filter(Boolean)
        const types = [...new Set(memberRaces.map(r => r.type))]
        const initials = member.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        const color = MEMBER_COLORS[idx % MEMBER_COLORS.length]

        return (
          <div key={member.id} style={S.card}>
            <div style={{ ...S.avatar, background: color }}>{initials}</div>
            <div style={S.name}>{member.full_name}</div>
            <div style={S.raceCount}>{memberEntries.length} {memberEntries.length === 1 ? 'race' : 'races'} entered</div>
            {member.role === 'admin' && <div style={S.role}>Admin</div>}
            {types.length > 0 && (
              <div style={S.tags}>
                {types.map(type => (
                  <span key={type} style={{
                    ...S.tag,
                    ...(type === 'IRONMAN' ? S.tagFull : type === '70.3' ? S.tag703 : S.tagOther)
                  }}>
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
