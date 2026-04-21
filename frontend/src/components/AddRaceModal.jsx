import { useState } from 'react'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: '1rem',
  },
  modal: {
    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
    borderTop: '3px solid #00C4B4',
    borderRadius: '10px', padding: '2rem',
    width: '100%', maxWidth: '480px',
  },
  title: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '22px', fontWeight: 700, letterSpacing: '2px',
    textTransform: 'uppercase', color: '#00C4B4', marginBottom: '1.5rem',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  group: { marginBottom: '12px' },
  label: {
    display: 'block',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase',
    color: '#555', marginBottom: '6px',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' },
  btnCancel: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase',
    padding: '10px 20px', background: 'none',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '5px', color: '#666', cursor: 'pointer',
  },
  btnSubmit: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase',
    padding: '10px 24px', background: '#00C4B4',
    border: 'none', borderRadius: '5px', color: '#000', cursor: 'pointer',
  },
}

export default function AddRaceModal({ onAdd, onClose }) {
  const [form, setForm] = useState({
    name: '', type: 'IRONMAN', race_date: '', location: '', source: 'manual',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name || !form.race_date) return
    onAdd(form)
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.title}>Add Race</div>
        <div style={S.row}>
          <div style={S.group}>
            <label style={S.label}>Race Name</label>
            <input placeholder="IRONMAN Florida" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div style={S.group}>
            <label style={S.label}>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="IRONMAN">IRONMAN (Full)</option>
              <option value="70.3">70.3 (Half)</option>
              <option value="Olympic">Olympic</option>
              <option value="Sprint">Sprint</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div style={S.row}>
          <div style={S.group}>
            <label style={S.label}>Date</label>
            <input type="date" value={form.race_date} onChange={e => set('race_date', e.target.value)} />
          </div>
          <div style={S.group}>
            <label style={S.label}>Location</label>
            <input placeholder="Panama City, FL" value={form.location} onChange={e => set('location', e.target.value)} />
          </div>
        </div>
        <div style={S.actions}>
          <button style={S.btnCancel} onClick={onClose}>Cancel</button>
          <button style={S.btnSubmit} onClick={submit}>Add Race</button>
        </div>
      </div>
    </div>
  )
}
