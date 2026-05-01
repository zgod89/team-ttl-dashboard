/**
 * ChallengeAdminModal.jsx
 * Admin modal for creating / editing / deactivating weekly challenges.
 * Matches the Discounts.jsx admin modal pattern exactly.
 *
 * Usage in Training.jsx:
 *   import ChallengeAdminModal from '../components/ChallengeAdminModal'
 *
 *   // Add to TrainingPage state:
 *   const [showChallengeModal, setShowChallengeModal] = useState(false)
 *
 *   // Add at the bottom of the JSX return, before closing </div>:
 *   {showChallengeModal && profile?.role === 'admin' && (
 *     <ChallengeAdminModal
 *       challenge={challenge}
 *       userId={userId}
 *       onSave={() => { setShowChallengeModal(false); loadChallenge() }}
 *       onClose={() => setShowChallengeModal(false)}
 *     />
 *   )}
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'

const SPORT_OPTIONS = ['Run', 'Ride', 'Swim', 'Walk']

const TYPE_OPTIONS = [
  { value: 'combined_distance', label: 'Combined distance',    hint: 'Team hits X km combined in a sport this week' },
  { value: 'everyone_logs_sport', label: 'Everyone logs sport', hint: 'Every athlete logs at least one activity in a sport' },
]

// Monday of the current week as YYYY-MM-DD
function thisMonday() {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

const EMPTY_FORM = {
  title:       '',
  type:        'combined_distance',
  sport_type:  'Run',
  target_value: '',
  week_start:  thisMonday(),
}

// Shared input/label styles matching Discounts.jsx admin modal
const input = {
  width: '100%', background: '#111',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '6px', color: '#fff',
  padding: '10px 12px', fontSize: '14px',
  fontFamily: 'Barlow, sans-serif', outline: 'none', boxSizing: 'border-box',
}
const label = {
  display: 'block',
  fontFamily: 'Barlow Condensed, sans-serif',
  fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase',
  color: '#999', marginBottom: '5px',
}
const group = { marginBottom: '12px' }

export default function ChallengeAdminModal({ challenge, userId, onSave, onClose }) {
  const [form, setForm] = useState(
    challenge
      ? {
          title:        challenge.title,
          type:         challenge.type,
          sport_type:   challenge.sport_type,
          target_value: String(challenge.target_value),
          week_start:   challenge.week_start,
        }
      : { ...EMPTY_FORM }
  )
  const [saving,    setSaving]    = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [error,     setError]     = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedType = TYPE_OPTIONS.find(o => o.value === form.type)

  async function handleSave() {
    if (!form.title.trim())                    return setError('Title is required.')
    if (!form.target_value || isNaN(Number(form.target_value))) {
      if (form.type === 'combined_distance')   return setError('Target distance (km) is required.')
    }
    setError('')
    setSaving(true)

    const payload = {
      title:             form.title.trim(),
      type:              form.type,
      sport_type:        form.sport_type,
      target_value:      Number(form.target_value) || 0,
      week_start:        form.week_start,
      is_active:         true,
      created_by:        userId,
      challenge_progress: {},
      updated_at:        new Date().toISOString(),
    }

    let err

    if (challenge) {
      // Update existing
      ;({ error: err } = await supabase
        .from('challenges')
        .update(payload)
        .eq('id', challenge.id))
    } else {
      ;({ error: err } = await supabase
        .from('challenges')
        .insert(payload))
    }

    setSaving(false)
    if (err) return setError(err.message)
    onSave()
  }

  async function handleDeactivate() {
    if (!challenge) return
    setDeactivating(true)
    const { error: err } = await supabase
      .from('challenges')
      .update({ is_active: false })
      .eq('id', challenge.id)
    setDeactivating(false)
    if (err) return setError(err.message)
    onSave()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.12)',
        borderTop: '3px solid #E8B84B',
        borderRadius: '10px', padding: '2rem',
        width: '100%', maxWidth: '480px',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Title */}
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '22px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#E8B84B', marginBottom: '4px' }}>
          {challenge ? 'Edit Challenge' : 'New Challenge'}
        </div>
        <div style={{ fontSize: '13px', color: '#555', marginBottom: '1.5rem' }}>
          Multiple challenges can run simultaneously — useful when the team has different sport preferences.
        </div>

        {/* Title field */}
        <div style={group}>
          <label style={label}>Challenge title</label>
          <input
            style={input}
            placeholder="e.g. 500km team run week"
            value={form.title}
            onChange={e => set('title', e.target.value)}
          />
        </div>

        {/* Type selector */}
        <div style={group}>
          <label style={label}>Challenge type</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => set('type', opt.value)}
                style={{
                  background: form.type === opt.value ? 'rgba(232,184,75,0.1)' : '#111',
                  border: `1px solid ${form.type === opt.value ? 'rgba(232,184,75,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6, padding: '10px 14px', cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 14, fontWeight: 600, color: form.type === opt.value ? '#E8B84B' : '#ccc', marginBottom: 2 }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 12, color: '#555' }}>{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Sport + target row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={label}>Sport</label>
            <select
              style={{ ...input, cursor: 'pointer' }}
              value={form.sport_type}
              onChange={e => set('sport_type', e.target.value)}
            >
              {SPORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {form.type === 'combined_distance' && (
            <div>
              <label style={label}>Target (km)</label>
              <input
                style={input}
                type="number"
                min="1"
                placeholder="500"
                value={form.target_value}
                onChange={e => set('target_value', e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Week start */}
        <div style={group}>
          <label style={label}>Week start (Monday)</label>
          <input
            style={input}
            type="date"
            value={form.week_start}
            onChange={e => set('week_start', e.target.value)}
          />
          <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
            Should be a Monday. Progress is calculated from activities during this 7-day window.
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(255,61,139,0.1)', border: '1px solid rgba(255,61,139,0.2)', borderRadius: 6, padding: '10px 12px', color: '#FF3D8B', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', gap: 8 }}>
          {/* Deactivate (edit mode only) */}
          <div>
            {challenge && (
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                style={{
                  fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase',
                  padding: '9px 16px', background: 'none',
                  border: '1px solid rgba(255,61,139,0.25)',
                  borderRadius: 5, color: '#FF3D8B', cursor: 'pointer',
                }}
              >
                {deactivating ? 'Deactivating...' : 'End challenge'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase',
                padding: '10px 20px', background: 'none',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 5, color: '#888', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase',
                padding: '10px 24px', background: '#E8B84B',
                border: 'none', borderRadius: 5, color: '#000', cursor: 'pointer',
              }}
            >
              {saving ? 'Saving...' : challenge ? 'Save changes' : 'Launch challenge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
