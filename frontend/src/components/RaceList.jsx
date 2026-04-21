const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MEMBER_COLORS = ['#00C4B4','#FF3D8B','#E8B84B','#FF5A1F','#a78bfa','#34d399','#f472b6','#60a5fa']

const S = {
  list: { display: 'flex', flexDirection: 'column', gap: '8px' },
  row: {
    background: '#161616', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', padding: '1rem 1.25rem',
    display: 'grid', gridTemplateColumns: '72px 1fr auto auto',
    alignItems: 'center', gap: '1rem',
    transition: 'border-color 0.15s', cursor: 'default',
  },
  rowMine: { borderLeft: '3px solid #00C4B4' },
  dateBlock: { textAlign: 'center' },
  dateMonth: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '11px', letterSpacing: '1px',
    textTransform: 'uppercase', color: '#555',
  },
  dateDay: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '30px', fontWeight: 700, lineHeight: 1, color: '#fff',
  },
  raceName: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '17px', fontWeight: 600, color: '#fff', marginBottom: '2px',
  },
  raceLoc: { fontSize: '12px', color: '#555' },
  badge: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
    padding: '3px 10px', borderRadius: '3px', textTransform: 'uppercase',
  },
  badgeFull: { background: 'rgba(0,196,180,0.12)', color: '#00C4B4', border: '1px solid rgba(0,196,180,0.25)' },
  badge703: { background: 'rgba(255,61,139,0.12)', color: '#FF3D8B', border: '1px solid rgba(255,61,139,0.25)' },
  badgeOther: { background: 'rgba(232,184,75,0.12)', color: '#E8B84B', border: '1px solid rgba(232,184,75,0.25)' },
  right: { display: 'flex', alignItems: 'center', gap: '10px' },
  avatars: { display: 'flex' },
  avatar: {
    width: '26px', height: '26px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '10px', fontWeight: 700,
    border: '2px solid #161616',
    marginLeft: '-6px', color: '#000',
  },
  btn: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase',
    padding: '6px 14px', background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '4px', color: '#ccc',
    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  btnJoined: { borderColor: '#00C4B4', color: '#00C4B4' },
  empty: {
    textAlign: 'center', padding: '3rem',
    fontFamily: 'Barlow Condensed, sans-serif',
    letterSpacing: '2px', color: '#444', textTransform: 'uppercase', fontSize: '14px',
  },
}

function getBadgeStyle(type) {
  if (type === 'IRONMAN') return { ...S.badge, ...S.badgeFull }
  if (type === '70.3') return { ...S.badge, ...S.badge703 }
  return { ...S.badge, ...S.badgeOther }
}

export default function RaceList({ races, myEntries, allEntries, profiles, onToggle }) {
  if (races.length === 0) return <div style={S.empty}>No upcoming races found</div>

  return (
    <div style={S.list}>
      {races.map((race, i) => {
        const d = new Date(race.race_date + 'T12:00:00')
        const isMine = myEntries.includes(race.id)
        const raceEntries = allEntries.filter(e => e.race_id === race.id)

        return (
          <div key={race.id} style={{ ...S.row, ...(isMine ? S.rowMine : {}) }}>
            <div style={S.dateBlock}>
              <div style={S.dateMonth}>{MONTHS[d.getMonth()]}</div>
              <div style={S.dateDay}>{d.getDate()}</div>
              <div style={{ ...S.dateMonth, marginTop: '2px' }}>{d.getFullYear()}</div>
            </div>

            <div>
              <div style={S.raceName}>{race.name}</div>
              <div style={S.raceLoc}>{race.location}</div>
            </div>

            <span style={getBadgeStyle(race.type)}>{race.type}</span>

            <div style={S.right}>
              <div style={S.avatars}>
                {raceEntries.slice(0, 5).map((entry, idx) => {
                  const initials = (entry.profiles?.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2)
                  return (
                    <div
                      key={entry.id}
                      style={{ ...S.avatar, background: MEMBER_COLORS[idx % MEMBER_COLORS.length], marginLeft: idx === 0 ? 0 : '-6px' }}
                      title={entry.profiles?.full_name}
                    >
                      {initials}
                    </div>
                  )
                })}
                {raceEntries.length > 5 && (
                  <div style={{ ...S.avatar, background: '#2a2a2a', color: '#888', marginLeft: '-6px' }}>
                    +{raceEntries.length - 5}
                  </div>
                )}
              </div>
              <button
                style={{ ...S.btn, ...(isMine ? S.btnJoined : {}) }}
                onClick={() => onToggle(race.id)}
              >
                {isMine ? '✓ Entered' : 'Enter'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
