const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const S = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
    marginBottom: '2rem',
  },
  month: {
    background: '#161616',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '12px',
    minHeight: '110px',
  },
  monthName: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '12px', letterSpacing: '1.5px',
    textTransform: 'uppercase', color: '#444',
    marginBottom: '8px',
  },
  dot: {
    fontSize: '11px',
    padding: '3px 7px',
    borderRadius: '3px',
    marginBottom: '3px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'default',
  },
  dotFull: { background: 'rgba(0,196,180,0.12)', color: '#00C4B4' },
  dot703: { background: 'rgba(255,61,139,0.12)', color: '#FF3D8B' },
  dotOther: { background: 'rgba(232,184,75,0.1)', color: '#E8B84B' },
  dotMine: { outline: '1px solid #fff', outlineOffset: '1px' },
  legend: {
    display: 'flex', gap: '16px', marginBottom: '1.5rem', flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '12px', color: '#888',
  },
  legendDot: {
    width: '10px', height: '10px', borderRadius: '2px',
  },
}

export default function CalendarView({ races, myEntries }) {
  const now = new Date()
  const currentYear = now.getFullYear()

  return (
    <>
      <div style={S.legend}>
        <div style={S.legendItem}>
          <div style={{ ...S.legendDot, background: '#00C4B4' }} />
          IRONMAN Full
        </div>
        <div style={S.legendItem}>
          <div style={{ ...S.legendDot, background: '#FF3D8B' }} />
          70.3 Half
        </div>
        <div style={S.legendItem}>
          <div style={{ ...S.legendDot, background: '#E8B84B' }} />
          Other
        </div>
        <div style={S.legendItem}>
          <div style={{ ...S.legendDot, background: 'transparent', border: '1px solid #fff' }} />
          My race
        </div>
      </div>

      <div style={S.grid}>
        {Array.from({ length: 12 }, (_, i) => {
          const monthRaces = races.filter(r => {
            const d = new Date(r.race_date + 'T12:00:00')
            return d.getFullYear() === currentYear && d.getMonth() === i
          })

          return (
            <div key={i} style={{
              ...S.month,
              ...(i < now.getMonth() ? { opacity: 0.4 } : {}),
            }}>
              <div style={S.monthName}>{FULL_MONTHS[i]}</div>
              {monthRaces.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#333' }}>—</div>
              ) : (
                monthRaces.map(race => {
                  const d = new Date(race.race_date + 'T12:00:00')
                  const isMine = myEntries.includes(race.id)
                  const dotStyle = race.type === 'IRONMAN' ? S.dotFull : race.type === '70.3' ? S.dot703 : S.dotOther
                  return (
                    <div
                      key={race.id}
                      style={{ ...S.dot, ...dotStyle, ...(isMine ? S.dotMine : {}) }}
                      title={`${race.name} — ${d.getDate()} ${MONTHS[d.getMonth()]}`}
                    >
                      {d.getDate()} {race.name.replace(/^Ironman\s+70\.3\s+/i, '').replace(/^Ironman\s+/i, '').replace(/^IRONMAN\s+70\.3\s+/i, '').replace(/^IRONMAN\s+/i, '')}
                    </div>
                  )
                })
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
