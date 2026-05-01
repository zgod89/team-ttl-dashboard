/**
 * ChallengeCard.jsx
 * Weekly challenge card — rendered above the activity feed in Training.jsx
 *
 * Usage in Training.jsx:
 *   import ChallengeCard from '../components/ChallengeCard'
 *
 *   // Add to TrainingPage state:
 *   const [challenge, setChallenge] = useState(null)
 *
 *   // Add to loadAll():
 *   await loadChallenge()
 *
 *   // New loader function:
 *   async function loadChallenge() {
 *     const { data } = await supabase
 *       .from('challenges')
 *       .select('*')
 *       .eq('is_active', true)
 *       .single()
 *     setChallenge(data || null)
 *   }
 *
 *   // In JSX, just above <MonthlySummary>:
 *   <ChallengeCard
 *     challenge={challenge}
 *     isAdmin={profile?.role === 'admin'}
 *     onManage={() => setShowChallengeModal(true)}
 *   />
 */

import { useState } from 'react'

const SPORT_EMOJI = { Run: '🏃', Ride: '🚴', Swim: '🏊', Walk: '🚶' }

function weekLabel(weekStart) {
  const d   = new Date(weekStart)
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  const fmt = dt => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(d)} – ${fmt(end)}`
}

// ── Combined distance progress ────────────────────────────────────
function CombinedDistance({ progress, challenge }) {
  const current = progress.current_km || 0
  const target  = progress.target_km  || Number(challenge?.target_value) || 1
  const sport   = progress.sport_type || ''
  const pct     = Math.min(100, Math.round((current / target) * 100))
  const done    = pct >= 100

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: '#999' }}>
          Team {sport.toLowerCase()} distance this week
        </span>
        <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, color: done ? '#00C4B4' : '#fff' }}>
          {current.toFixed(1)} / {target} km
        </span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 4,
          background: done
            ? 'linear-gradient(90deg, #00C4B4, #34d399)'
            : 'linear-gradient(90deg, #FC4C02, #E8B84B)',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 11, color: done ? '#00C4B4' : '#555' }}>
          {done ? '🎉 Challenge complete!' : `${pct}% there`}
        </span>
        <span style={{ fontSize: 11, color: '#444' }}>{target} km goal</span>
      </div>
    </div>
  )
}

// ── Everyone logs sport progress ──────────────────────────────────
const AVATAR_COLORS = ['#00C4B4', '#FF3D8B', '#E8B84B', '#FF5A1F', '#a78bfa', '#34d399', '#f472b6', '#60a5fa']

function avatarColor(name) {
  return AVATAR_COLORS[(name || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
}

function AthleteChip({ athlete, done }) {
  const [hovered, setHovered] = useState(false)
  const initials = (athlete.initials
    || (athlete.full_name || '?').split(' ').map(w => w[0]).join('')
  ).slice(0, 2).toUpperCase()

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: done ? avatarColor(athlete.full_name) : 'rgba(255,255,255,0.06)',
        border: done ? '2px solid rgba(0,196,180,0.35)' : '2px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fontWeight: 700,
        color: done ? '#000' : '#444',
        transition: 'all 0.15s',
        cursor: 'default',
      }}>
        {initials}
      </div>
      {hovered && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%',
          transform: 'translateX(-50%)', marginBottom: 6,
          whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
          background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 11, color: '#fff',
        }}>
          {athlete.full_name}
        </div>
      )}
    </div>
  )
}

function EveryoneLogs({ progress }) {
  const completed = progress.completed       || []
  const pending   = progress.pending         || []
  const total     = progress.count_total     || 0
  const nDone     = progress.count_completed || 0
  const sport     = progress.sport_type      || ''
  const allDone   = total > 0 && nDone === total

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#999' }}>
          Everyone logs a {sport.toLowerCase()} this week
        </span>
        <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, fontWeight: 700, color: allDone ? '#00C4B4' : '#fff' }}>
          {nDone} / {total}
        </span>
      </div>

      {completed.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#00C4B4', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
            ✓ Done
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {completed.map(a => <AthleteChip key={a.id} athlete={a} done />)}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#555', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
            Still waiting on
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pending.map(a => <AthleteChip key={a.id} athlete={a} done={false} />)}
          </div>
        </div>
      )}

      {allDone && (
        <div style={{ marginTop: 10, fontFamily: 'Barlow Condensed, sans-serif', fontSize: 14, fontWeight: 700, color: '#00C4B4' }}>
          🎉 Every athlete has done it!
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────
export default function ChallengeCard({ challenge, isAdmin, onManage }) {
  if (!challenge) return null

  const progress   = challenge.challenge_progress || {}
  const isCombined = challenge.type === 'combined_distance'
  const isEveryone = challenge.type === 'everyone_logs_sport'
  const sportEmoji = SPORT_EMOJI[challenge.sport_type] || '🏋️'

  return (
    <div style={{
      background: 'rgba(232,184,75,0.05)',
      border: '1px solid rgba(232,184,75,0.2)',
      borderTop: '2px solid #E8B84B',
      borderRadius: 10,
      padding: '1rem 1.25rem',
      marginBottom: '1.25rem',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'rgba(232,184,75,0.12)', border: '1px solid rgba(232,184,75,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>
            {sportEmoji}
          </div>
          <div>
            <div style={{
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2, lineHeight: 1.2,
            }}>
              {challenge.title}
            </div>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', color: '#E8B84B' }}>
              Weekly Challenge · {weekLabel(challenge.week_start)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase',
            background: 'rgba(0,196,180,0.12)', color: '#00C4B4',
            border: '1px solid rgba(0,196,180,0.25)', padding: '2px 8px', borderRadius: 3,
          }}>
            Active
          </span>
          {isAdmin && (
            <button
              onClick={onManage}
              style={{
                fontFamily: 'Barlow Condensed, sans-serif', fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase',
                padding: '2px 8px', borderRadius: 3,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'none', color: '#888', cursor: 'pointer',
              }}
            >
              Manage
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {isCombined && <CombinedDistance progress={progress} challenge={challenge} />}
      {isEveryone  && <EveryoneLogs    progress={progress} />}
    </div>
  )
}
