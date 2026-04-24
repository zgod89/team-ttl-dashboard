import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function CopyButton({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={{
      fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', fontWeight: 700,
      letterSpacing: '1px', textTransform: 'uppercase', padding: '6px 14px',
      background: copied ? 'rgba(0,196,180,0.15)' : 'rgba(255,255,255,0.06)',
      border: `1px solid ${copied ? 'rgba(0,196,180,0.4)' : 'rgba(255,255,255,0.12)'}`,
      borderRadius: '4px', color: copied ? '#00C4B4' : '#ccc', cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {copied ? '✓ Copied' : code}
    </button>
  )
}

function DiscountCard({ discount, isAdmin, onEdit, onDelete }) {
  const isExpired = discount.expiry && new Date(discount.expiry) < new Date()
  const daysLeft = discount.expiry ? Math.ceil((new Date(discount.expiry) - new Date()) / 86400000) : null

  return (
    <div style={{
      background: '#161616', border: `1px solid ${isExpired ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      opacity: isExpired ? 0.5 : 1, position: 'relative',
    }}>
      {/* Admin actions */}
      {isAdmin && (
        <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '4px', zIndex: 2 }}>
          <button onClick={() => onEdit(discount)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#aaa', fontSize: '11px', padding: '3px 8px', cursor: 'pointer', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.5px' }}>Edit</button>
          <button onClick={() => onDelete(discount)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,61,139,0.2)', borderRadius: '4px', color: '#FF3D8B', fontSize: '11px', padding: '3px 8px', cursor: 'pointer', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.5px' }}>×</button>
        </div>
      )}

      {/* Brand header */}
      <div style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: discount.color || 'rgba(0,196,180,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
          {discount.brand.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{discount.brand}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>{discount.category}</div>
        </div>
        {discount.amount && (
          <div style={{ flexShrink: 0, fontFamily: 'Barlow Condensed, sans-serif', fontSize: '22px', fontWeight: 800, color: '#00C4B4' }}>{discount.amount}</div>
        )}
      </div>

      {/* Description + code */}
      <div style={{ padding: '1rem 1.25rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '13px', color: '#bbb', lineHeight: 1.5 }}>{discount.description}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' }}>
          {discount.code
            ? <CopyButton code={discount.code} />
            : <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', color: '#555', padding: '6px 0' }}>Code coming soon</div>
          }
          {discount.single_use && (
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', padding: '3px 8px', background: 'rgba(232,184,75,0.1)', color: '#E8B84B', border: '1px solid rgba(232,184,75,0.25)', borderRadius: '3px' }}>Single use</div>
          )}
          {discount.note === 'rolling-availability' && (
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', padding: '3px 8px', background: 'rgba(0,196,180,0.08)', color: '#00C4B4', border: '1px solid rgba(0,196,180,0.2)', borderRadius: '3px' }}>Rolling offer</div>
          )}
          {daysLeft !== null && (
            <div style={{ fontSize: '11px', color: daysLeft <= 7 ? '#FF5A1F' : '#555', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.5px', marginLeft: 'auto' }}>
              {isExpired ? 'Expired' : daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY_FORM = { brand: '', code: '', amount: '', description: '', category: '', color: '#00C4B4', expiry: '', single_use: false, note: '', active: true, sort_order: 0 }

function DiscountModal({ discount, onSave, onClose }) {
  const [form, setForm] = useState(discount ? {
    ...discount,
    expiry: discount.expiry ? discount.expiry.slice(0, 10) : '',
    note: discount.note || '',
    code: discount.code || '',
    amount: discount.amount || '',
    color: discount.color || '#00C4B4',
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inputStyle = { width: '100%', background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff', padding: '10px 12px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: '5px' }
  const groupStyle = { marginBottom: '12px' }

  async function save() {
    if (!form.brand.trim()) { setError('Brand name is required'); return }
    setSaving(true)
    const payload = {
      brand: form.brand.trim(),
      code: form.code.trim() || null,
      amount: form.amount.trim() || null,
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      color: form.color || null,
      expiry: form.expiry || null,
      single_use: form.single_use,
      note: form.note.trim() || null,
      active: form.active,
      sort_order: parseInt(form.sort_order) || 0,
    }
    const { error: err } = discount?.id
      ? await supabase.from('discounts').update(payload).eq('id', discount.id)
      : await supabase.from('discounts').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderTop: '3px solid #00C4B4', borderRadius: '10px', padding: '2rem', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00C4B4', marginBottom: '1.5rem' }}>
          {discount?.id ? 'Edit Discount' : 'Add Discount'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={groupStyle}>
            <label style={labelStyle}>Brand *</label>
            <input style={inputStyle} value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Orca" />
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Category</label>
            <input style={inputStyle} value={form.category} onChange={e => set('category', e.target.value)} placeholder="Wetsuits & Swimwear" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={groupStyle}>
            <label style={labelStyle}>Discount Code</label>
            <input style={inputStyle} value={form.code} onChange={e => set('code', e.target.value)} placeholder="TTL20 (leave blank = coming soon)" />
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Amount</label>
            <input style={inputStyle} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="20% off" />
          </div>
        </div>

        <div style={groupStyle}>
          <label style={labelStyle}>Description</label>
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What does this discount cover?" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '12px' }}>
          <div style={groupStyle}>
            <label style={labelStyle}>Expiry Date</label>
            <input style={inputStyle} type="date" value={form.expiry} onChange={e => set('expiry', e.target.value)} />
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Brand Colour</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input style={{ ...inputStyle, flex: 1 }} value={form.color} onChange={e => set('color', e.target.value)} placeholder="#e63946" />
              <input type="color" value={form.color || '#00C4B4'} onChange={e => set('color', e.target.value)} style={{ width: '36px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }} />
            </div>
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Order</label>
            <input style={inputStyle} type="number" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} min="0" />
          </div>
        </div>

        <div style={groupStyle}>
          <label style={labelStyle}>Note</label>
          <input style={inputStyle} value={form.note} onChange={e => set('note', e.target.value)} placeholder="rolling-availability (optional)" />
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#ccc' }}>
            <input type="checkbox" checked={form.single_use} onChange={e => set('single_use', e.target.checked)} />
            Single-use code
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#ccc' }}>
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
            Active
          </label>
        </div>

        {error && <div style={{ color: '#FF3D8B', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase', padding: '10px 20px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px', color: '#999', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 24px', background: '#00C4B4', border: 'none', borderRadius: '5px', color: '#000', cursor: 'pointer' }}>
            {saving ? 'Saving...' : discount?.id ? 'Save Changes' : 'Add Discount'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Discounts({ profile }) {
  const [discounts, setDiscounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingDiscount, setEditingDiscount] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { loadDiscounts() }, [])

  async function loadDiscounts() {
    const { data } = await supabase.from('discounts').select('*').eq('active', true).order('sort_order').order('brand')
    if (data) setDiscounts(data)
    setLoading(false)
  }

  async function handleDelete(discount) {
    if (!confirm(`Remove ${discount.brand} discount?`)) return
    await supabase.from('discounts').update({ active: false }).eq('id', discount.id)
    setDiscounts(prev => prev.filter(d => d.id !== discount.id))
  }

  function handleEdit(discount) { setEditingDiscount(discount); setShowModal(true) }
  function handleAdd() { setEditingDiscount(null); setShowModal(true) }
  async function handleSave() { setShowModal(false); setLoading(true); await loadDiscounts() }

  const activeDiscounts = discounts.filter(d => !d.expiry || new Date(d.expiry) >= new Date())
  const expiredDiscounts = discounts.filter(d => d.expiry && new Date(d.expiry) < new Date())

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Barlow Condensed', letterSpacing: 2, color: '#999', textTransform: 'uppercase' }}>Loading...</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '36px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: '4px' }}>Team Discounts</div>
          <div style={{ fontSize: '14px', color: '#999' }}>Exclusive member benefits from our partners. Tap a code to copy it.</div>
        </div>
        {isAdmin && (
          <button onClick={handleAdd} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 20px', background: '#00C4B4', border: 'none', borderRadius: '6px', color: '#000', cursor: 'pointer', flexShrink: 0 }}>
            + Add Discount
          </button>
        )}
      </div>

      {discounts.length === 0 ? (
        <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏷️</div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', marginBottom: '8px' }}>No discounts yet</div>
          <div style={{ fontSize: '14px', color: '#999' }}>{isAdmin ? 'Click "+ Add Discount" to add your first partner benefit.' : 'Partner discounts will appear here soon.'}</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px', marginBottom: expiredDiscounts.length > 0 ? '2.5rem' : 0 }}>
            {activeDiscounts.map(d => <DiscountCard key={d.id} discount={d} isAdmin={isAdmin} onEdit={handleEdit} onDelete={handleDelete} />)}
          </div>
          {expiredDiscounts.length > 0 && (
            <>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', color: '#444', marginBottom: '12px' }}>Expired</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {expiredDiscounts.map(d => <DiscountCard key={d.id} discount={d} isAdmin={isAdmin} onEdit={handleEdit} onDelete={handleDelete} />)}
              </div>
            </>
          )}
        </>
      )}

      {showModal && <DiscountModal discount={editingDiscount} onSave={handleSave} onClose={() => setShowModal(false)} />}
    </div>
  )
}
