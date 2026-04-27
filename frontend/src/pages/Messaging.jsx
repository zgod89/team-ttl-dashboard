import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const MEMBER_COLORS = ['#00C4B4','#FF3D8B','#E8B84B','#FF5A1F','#a78bfa','#34d399','#f472b6','#60a5fa']
const QUICK_EMOJIS = ['👍','💪','🔥','🤘','🏁','❤️','🎉','😮']
const ALL_EMOJIS = ['😀','😂','🥹','😍','🤩','😎','🥳','🤔','😮','💪','🔥','❤️','👍','🎉','🏆','🤘','🏁','🏊','🚴','🏃','⚡','💯','🙌','👏']

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Avatar({ profile, size = 32, idx = 0 }) {
  const name = profile?.full_name || 'Athlete'
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const color = profile?.avatar_color || MEMBER_COLORS[idx % MEMBER_COLORS.length]
  if (profile?.avatar_url) return <img src={profile.avatar_url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontSize: size * 0.38, fontWeight: 700, color: '#000', flexShrink: 0 }}>{initials}</div>
}

// Render message content with @mentions highlighted
function MessageContent({ content, currentUserId, profiles }) {
  if (!content) return null
  const parts = content.split(/(@\w[\w\s]*)/g)
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const name = part.slice(1).trim()
          const mentioned = profiles?.find(p => p.full_name?.toLowerCase() === name.toLowerCase())
          const isMe = mentioned?.id === currentUserId
          return (
            <span key={i} style={{
              background: isMe ? 'rgba(255,61,139,0.2)' : 'rgba(0,196,180,0.15)',
              color: isMe ? '#FF3D8B' : '#00C4B4',
              borderRadius: '3px', padding: '0 3px',
              fontWeight: 600,
            }}>{part}</span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

export default function Messaging({ session, profile, onReadChannel }) {
  const [channels, setChannels] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({})
  const [mentionCount, setMentionCount] = useState(0)
  const [showSidebar, setShowSidebar] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 680)
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const userId = session.user.id
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 680
      setIsMobile(mobile)
      if (!mobile) setShowSidebar(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => { loadChannels() }, [])

  useEffect(() => {
    const channelId = searchParams.get('channel')
    if (channelId && channels.length > 0) {
      const ch = channels.find(c => c.id === channelId)
      if (ch) openChannel(ch)
    }
  }, [searchParams, channels])

  async function loadChannels() {
    const [channelsRes, readsRes, mentionsRes] = await Promise.all([
      supabase.from('channels').select('*, races(name)').order('type').order('name'),
      supabase.from('channel_reads').select('*').eq('athlete_id', userId),
      supabase.from('message_mentions').select('*', { count: 'exact', head: true }).eq('mentioned_user_id', userId).is('seen_at', null),
    ])
    if (channelsRes.data) setChannels(channelsRes.data)
    setMentionCount(mentionsRes.count || 0)

    if (channelsRes.data && readsRes.data) {
      const readsMap = {}
      readsRes.data.forEach(r => { readsMap[r.channel_id] = r.last_read_at })
      const counts = {}
      for (const ch of channelsRes.data) {
        const lastRead = readsMap[ch.id]
        const q = supabase.from('messages').select('*', { count: 'exact', head: true }).eq('channel_id', ch.id)
        if (lastRead) q.gt('created_at', lastRead)
        const { count } = await q
        counts[ch.id] = count || 0
      }
      setUnreadCounts(counts)
    }
    setLoading(false)
  }

  async function openChannel(channel) {
    setSelectedChannel(channel)
    setShowMentions(false)
    if (isMobile) setShowSidebar(false)
    await supabase.from('channel_reads').upsert(
      { channel_id: channel.id, athlete_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'channel_id,athlete_id' }
    )
    setUnreadCounts(prev => ({ ...prev, [channel.id]: 0 }))
    onReadChannel?.()
  }

  async function openMentions() {
    setShowMentions(true)
    setSelectedChannel(null)
    if (isMobile) setShowSidebar(false)
    // Mark all mentions as seen
    await supabase.from('message_mentions').update({ seen_at: new Date().toISOString() }).eq('mentioned_user_id', userId).is('seen_at', null)
    setMentionCount(0)
  }

  const generalChannels = channels.filter(c => c.type === 'general')
  const topicChannels = channels.filter(c => c.type === 'topic')
  const raceChannels = channels.filter(c => c.type === 'race')
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Barlow Condensed', letterSpacing: 2, color: '#999', textTransform: 'uppercase' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 59px)', overflow: 'hidden' }}>

      {/* Sidebar */}
      {(showSidebar || !isMobile) && (
        <div style={{ width: isMobile ? '100%' : '260px', background: '#111', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '18px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff' }}>Messages</div>
            {isAdmin && <button onClick={() => setShowNewChannel(true)} style={{ background: 'none', border: 'none', color: '#00C4B4', fontSize: '22px', cursor: 'pointer', padding: '0', lineHeight: 1 }}>+</button>}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
            {/* Mentions */}
            <button onClick={openMentions} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 16px', background: showMentions ? 'rgba(255,61,139,0.1)' : 'none', border: 'none', borderLeft: showMentions ? '2px solid #FF3D8B' : '2px solid transparent', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: '13px', color: showMentions ? '#FF3D8B' : '#555' }}>@</span>
              <span style={{ flex: 1, fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', color: showMentions ? '#fff' : mentionCount > 0 ? '#fff' : '#888', fontWeight: mentionCount > 0 ? 600 : 400 }}>Mentions</span>
              {mentionCount > 0 && <div style={{ background: '#FF3D8B', color: '#fff', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', fontWeight: 700, borderRadius: '10px', padding: '1px 6px' }}>{mentionCount}</div>}
            </button>

            <ChannelGroup label="General" channels={generalChannels} selected={selectedChannel} unread={unreadCounts} onSelect={openChannel} />
            {topicChannels.length > 0 && <ChannelGroup label="Topics" channels={topicChannels} selected={selectedChannel} unread={unreadCounts} onSelect={openChannel} />}
            {raceChannels.length > 0 && <ChannelGroup label="Race Threads" channels={raceChannels} selected={selectedChannel} unread={unreadCounts} onSelect={openChannel} />}
          </div>
        </div>
      )}

      {/* Mentions view */}
      {(!showSidebar || !isMobile) && showMentions && (
        <MentionsView session={session} profile={profile} isMobile={isMobile} channels={channels} onBack={() => { setShowSidebar(true); setShowMentions(false) }} onOpenChannel={openChannel} />
      )}

      {/* Message thread */}
      {(!showSidebar || !isMobile) && selectedChannel && !showMentions && (
        <MessageThread
          key={selectedChannel.id}
          channel={selectedChannel}
          session={session}
          profile={profile}
          isMobile={isMobile}
          onBack={() => { setShowSidebar(true); setSelectedChannel(null) }}
          onMarkRead={() => setUnreadCounts(prev => ({ ...prev, [selectedChannel.id]: 0 }))}
          onMention={() => setMentionCount(prev => prev + 1)}
        />
      )}

      {/* Empty state */}
      {!isMobile && !selectedChannel && !showMentions && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '48px' }}>💬</div>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', letterSpacing: '2px', textTransform: 'uppercase', color: '#555' }}>Select a channel to start chatting</div>
        </div>
      )}

      {showNewChannel && (
        <NewChannelModal session={session} onClose={() => setShowNewChannel(false)} onCreated={(ch) => { setChannels(prev => [...prev, ch]); setShowNewChannel(false); openChannel(ch) }} />
      )}
    </div>
  )
}

function ChannelGroup({ label, channels, selected, unread, onSelect }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: '#555', padding: '6px 16px 4px' }}>{label}</div>
      {channels.map(ch => {
        const isSelected = selected?.id === ch.id
        const unreadCount = unread[ch.id] || 0
        const displayName = ch.type === 'race' ? (ch.races?.name?.replace(/ironman\s+70\.3\s+/i, '').replace(/ironman\s+/i, '') || ch.name) : ch.name
        return (
          <button key={ch.id} onClick={() => onSelect(ch)} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 16px', background: isSelected ? 'rgba(0,196,180,0.1)' : 'none', border: 'none', borderLeft: isSelected ? '2px solid #00C4B4' : '2px solid transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}>
            <span style={{ color: isSelected ? '#00C4B4' : '#555', fontSize: '13px', flexShrink: 0 }}>{ch.type === 'race' ? '🏁' : '#'}</span>
            <span style={{ flex: 1, fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', color: isSelected ? '#fff' : unreadCount > 0 ? '#fff' : '#888', fontWeight: unreadCount > 0 ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
            {unreadCount > 0 && <div style={{ background: '#00C4B4', color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', fontWeight: 700, borderRadius: '10px', padding: '1px 6px', flexShrink: 0 }}>{unreadCount > 99 ? '99+' : unreadCount}</div>}
          </button>
        )
      })}
    </div>
  )
}

function MentionsView({ session, profile, isMobile, channels, onBack, onOpenChannel }) {
  const [mentions, setMentions] = useState([])
  const [loading, setLoading] = useState(true)
  const userId = session.user.id

  useEffect(() => { loadMentions() }, [])

  async function loadMentions() {
    // Step 1 — get all mentions for this user
    const { data: mentionData, error: mentionError } = await supabase
      .from('message_mentions')
      .select('*, channels(id, name, type, races(name))')
      .eq('mentioned_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (mentionError) { console.error('[Mentions] mention query error:', mentionError.message); setLoading(false); return }
    if (!mentionData?.length) { setLoading(false); return }

    // Step 2 — fetch the actual messages separately
    const messageIds = mentionData.map(m => m.message_id).filter(Boolean)
    const { data: messageData, error: messageError } = await supabase
      .from('messages')
      .select('id, content, created_at, athlete_id, profiles(full_name, avatar_color, avatar_url)')
      .in('id', messageIds)

    if (messageError) console.error('[Mentions] message query error:', messageError.message)

    const messageMap = {}
    messageData?.forEach(m => { messageMap[m.id] = m })

    // Merge
    const merged = mentionData.map(m => ({
      ...m,
      message: messageMap[m.message_id] || null,
    }))

    setMentions(merged)
    setLoading(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, background: '#111' }}>
        {isMobile && <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#999', fontSize: '20px', cursor: 'pointer', padding: '0', marginRight: '4px' }}>←</button>}
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, color: '#fff' }}>@ Mentions</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {loading ? <div style={{ color: '#555', fontSize: '13px' }}>Loading...</div>
          : mentions.length === 0 ? (
            <div style={{ textAlign: 'center', margin: 'auto', padding: '3rem', color: '#555', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>
              No mentions yet
            </div>
          ) : mentions.map(m => {
            const ch = m.channels
            const msg = m.message
            const chName = ch?.type === 'race' ? (ch.races?.name || ch.name) : ch?.name
            return (
              <div key={m.id} onClick={() => onOpenChannel(ch)} style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid #FF3D8B', borderRadius: '8px', padding: '12px', marginBottom: '8px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Avatar profile={msg?.profiles} size={24} />
                  <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff' }}>{msg?.profiles?.full_name || 'Athlete'}</span>
                  <span style={{ fontSize: '11px', color: '#555' }}>in #{chName}</span>
                  <span style={{ fontSize: '11px', color: '#555', marginLeft: 'auto' }}>{timeAgo(m.created_at)}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#bbb', lineHeight: 1.5 }}>{msg?.content}</div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

function MessageThread({ channel, session, profile, isMobile, onBack, onMarkRead, onMention }) {
  const [messages, setMessages] = useState([])
  const [profiles, setProfiles] = useState([])
  const [reactions, setReactions] = useState({})
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(null)
  const [showInputEmoji, setShowInputEmoji] = useState(false)
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [editingMsg, setEditingMsg] = useState(null) // { id, content }
  const [editText, setEditText] = useState('')
  const bottomRef = useRef()
  const fileRef = useRef()
  const textareaRef = useRef()
  const userId = session.user.id

  useEffect(() => {
    loadMessages()
    loadProfiles()
    const sub = supabase.channel(`messages:${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel.id}` },
        async (payload) => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev
            supabase.from('messages').select('*, profiles(full_name, avatar_color, avatar_url), reply_msg:reply_to(id, content, profiles(full_name))').eq('id', payload.new.id).single()
              .then(({ data }) => {
                if (data) {
                  setMessages(p => p.some(m => m.id === data.id) ? p : [...p, data])
                  onMarkRead()
                }
              })
            return prev
          })
        })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [channel.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_color, avatar_url')
    if (data) setProfiles(data)
  }

  async function loadMessages() {
    const [msgRes, reactRes] = await Promise.all([
      supabase.from('messages').select('*, profiles(full_name, avatar_color, avatar_url), reply_msg:reply_to(id, content, profiles(full_name))').eq('channel_id', channel.id).order('created_at').limit(100),
      supabase.from('message_reactions').select('*').in('message_id',
        (await supabase.from('messages').select('id').eq('channel_id', channel.id)).data?.map(m => m.id) || []
      ),
    ])
    if (msgRes.data) setMessages(msgRes.data)
    if (reactRes.data) {
      const grouped = {}
      reactRes.data.forEach(r => { if (!grouped[r.message_id]) grouped[r.message_id] = []; grouped[r.message_id].push(r) })
      setReactions(grouped)
    }
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100)
  }

  // Parse @mentions from text by checking against known profile names
  function extractMentions(content) {
    if (!content || !profiles.length) return []
    const mentioned = []
    for (const p of profiles) {
      if (!p.full_name) continue
      // Check if @FullName appears anywhere in the content (case-insensitive)
      const escaped = p.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`@${escaped}`, 'i')
      if (regex.test(content)) {
        mentioned.push(p.id)
      }
    }
    return mentioned
  }

  async function sendMessage(imageUrl = null) {
    const content = text.trim()
    if (!content && !imageUrl) return

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg = {
      id: optimisticId, channel_id: channel.id, athlete_id: userId,
      content: content || null, image_url: imageUrl || null,
      reply_to: replyTo?.id || null, reply_msg: replyTo ? { id: replyTo.id, content: replyTo.content, profiles: replyTo.profiles } : null,
      created_at: new Date().toISOString(), profiles: profile, optimistic: true,
    }
    setMessages(prev => [...prev, optimisticMsg])
    setText('')
    setReplyTo(null)
    setSending(true)

    const { data, error } = await supabase.from('messages').insert({
      channel_id: channel.id, athlete_id: userId,
      content: content || null, image_url: imageUrl || null,
      reply_to: replyTo?.id || null,
    }).select('*, profiles(full_name, avatar_color, avatar_url), reply_msg:reply_to(id, content, profiles(full_name))').single()

    if (!error && data) {
      setMessages(prev => prev.map(m => m.id === optimisticId ? data : m))
      // Insert mentions
      const mentionedIds = extractMentions(content || '')
      if (mentionedIds.length > 0) {
        const mentionRows = mentionedIds.filter(id => id !== userId).map(id => ({
          message_id: data.id, mentioned_user_id: id, channel_id: channel.id,
        }))
        const { error: mentionError } = await supabase.from('message_mentions').insert(mentionRows)
        if (mentionError) console.error('[Mentions] insert error:', mentionError.message)
        if (!mentionedIds.includes(userId)) onMention?.()
      }
    } else {
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    }
    setSending(false)
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return }
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `messages/${channel.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await sendMessage(publicUrl)
    }
    setUploading(false)
    e.target.value = ''
  }

  async function toggleReaction(messageId, emoji) {
    setShowEmojiPicker(null)
    const existing = (reactions[messageId] || []).find(r => r.athlete_id === userId && r.emoji === emoji)
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id)
      setReactions(prev => ({ ...prev, [messageId]: (prev[messageId] || []).filter(r => r.id !== existing.id) }))
    } else {
      const { data, error } = await supabase.from('message_reactions').insert({ message_id: messageId, athlete_id: userId, emoji }).select().single()
      if (!error && data) setReactions(prev => ({ ...prev, [messageId]: [...(prev[messageId] || []), data] }))
    }
  }

  async function saveEdit() {
    const content = editText.trim()
    if (!content || !editingMsg) return
    const { error } = await supabase.from('messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', editingMsg.id)
    if (!error) {
      setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content, edited_at: new Date().toISOString() } : m))
    }
    setEditingMsg(null)
    setEditText('')
  }

  // Handle @mention detection in textarea
  function handleTextChange(e) {
    const val = e.target.value
    setText(val)
    const cursor = e.target.selectionStart
    const textUpToCursor = val.slice(0, cursor)
    const atMatch = textUpToCursor.match(/@(\w[\w\s]*)$/)
    if (atMatch) {
      const q = atMatch[1].toLowerCase()
      const filtered = profiles.filter(p => p.full_name?.toLowerCase().includes(q) && p.id !== userId)
      setMentionQuery({ query: q, filtered, atIndex: textUpToCursor.lastIndexOf('@') })
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  function insertMention(p) {
    if (!mentionQuery) return
    const before = text.slice(0, mentionQuery.atIndex)
    const after = text.slice(mentionQuery.atIndex + mentionQuery.query.length + 1)
    const newText = `${before}@${p.full_name} ${after}`
    setText(newText)
    setMentionQuery(null)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (mentionQuery?.filtered?.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionQuery.filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionQuery.filtered[mentionIndex]); return }
      if (e.key === 'Escape') { setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const groupedMessages = messages.reduce((acc, msg, i) => {
    const prev = messages[i - 1]
    const sameAuthor = prev?.athlete_id === msg.athlete_id && !msg.reply_to
    const closeInTime = prev && (new Date(msg.created_at) - new Date(prev.created_at)) < 5 * 60 * 1000
    acc.push({ ...msg, showHeader: !sameAuthor || !closeInTime || !!msg.reply_to })
    return acc
  }, [])

  const displayName = channel.type === 'race' ? (channel.races?.name || channel.name) : channel.name

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, background: '#111' }}>
        {isMobile && <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#999', fontSize: '20px', cursor: 'pointer', padding: '0', marginRight: '4px' }}>←</button>}
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', color: '#555', flexShrink: 0 }}>{channel.type === 'race' ? '🏁' : '#'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
          {channel.description && <div style={{ fontSize: '12px', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{channel.description}</div>}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', margin: 'auto', color: '#555', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>No messages yet — say hello!</div>
        )}
        {groupedMessages.map((msg) => {
          const msgReactions = reactions[msg.id] || []
          const grouped = msgReactions.reduce((acc, r) => { if (!acc[r.emoji]) acc[r.emoji] = []; acc[r.emoji].push(r.athlete_id); return acc }, {})
          const isHovered = hoveredMsg === msg.id

          return (
            <div key={msg.id} style={{ marginTop: msg.showHeader ? '12px' : '1px', position: 'relative' }}
              onMouseEnter={() => setHoveredMsg(msg.id)}
              onMouseLeave={() => { setHoveredMsg(null); setShowEmojiPicker(null) }}
            >
              {/* Reply quote */}
              {msg.reply_msg && (
                <div style={{ paddingLeft: '42px', marginBottom: '2px' }}>
                  <div style={{ borderLeft: '2px solid #00C4B4', paddingLeft: '8px', fontSize: '12px', color: '#555', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ color: '#00C4B4', fontWeight: 600, fontFamily: 'Barlow Condensed, sans-serif' }}>{msg.reply_msg.profiles?.full_name || 'Athlete'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{msg.reply_msg.content}</span>
                  </div>
                </div>
              )}

              {msg.showHeader && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '2px' }}>
                  <Avatar profile={msg.profiles} size={32} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', fontWeight: 700, color: '#fff' }}>{msg.profiles?.full_name || 'Athlete'}</span>
                      <span style={{ fontSize: '11px', color: '#555' }}>{timeAgo(msg.created_at)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ paddingLeft: msg.showHeader ? '0' : '42px' }}>
                {msg.content && editingMsg?.id === msg.id ? (
                  // Inline edit input
                  <div style={{ marginTop: '4px' }}>
                    <textarea
                      autoFocus
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid rgba(0,196,180,0.4)', borderRadius: '6px', color: '#fff', padding: '8px 10px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', outline: 'none', resize: 'none', lineHeight: 1.5, minHeight: '40px', maxHeight: '120px', boxSizing: 'border-box' }}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
                        if (e.key === 'Escape') { setEditingMsg(null); setEditText('') }
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
                      <button onClick={saveEdit} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', padding: '4px 12px', background: '#00C4B4', border: 'none', borderRadius: '4px', color: '#000', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => { setEditingMsg(null); setEditText('') }} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', padding: '4px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#999', cursor: 'pointer' }}>Cancel</button>
                      <span style={{ fontSize: '11px', color: '#555', alignSelf: 'center' }}>Enter to save · Esc to cancel</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '14px', color: '#ccc', lineHeight: 1.6, wordBreak: 'break-word', opacity: msg.optimistic ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                    <MessageContent content={msg.content} currentUserId={userId} profiles={profiles} />
                    {msg.edited_at && (
                      <span style={{ fontSize: '10px', color: '#555', marginLeft: '6px', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.5px' }}>(edited)</span>
                    )}
                  </div>
                )}
                {msg.image_url && (
                  <img src={msg.image_url} alt="shared" style={{ maxWidth: '280px', maxHeight: '300px', borderRadius: '8px', marginTop: '4px', display: 'block', cursor: 'pointer', objectFit: 'cover', opacity: msg.optimistic ? 0.5 : 1, transition: 'opacity 0.2s' }} onClick={() => window.open(msg.image_url, '_blank')} />
                )}
                {msg.optimistic && <div style={{ fontSize: '10px', color: '#555', marginTop: '2px', fontFamily: 'Barlow Condensed, sans-serif' }}>Sending...</div>}

                {/* Reaction pills */}
                {Object.keys(grouped).length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {Object.entries(grouped).map(([emoji, userIds]) => (
                      <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                        style={{ display: 'flex', alignItems: 'center', gap: '3px', background: userIds.includes(userId) ? 'rgba(0,196,180,0.1)' : '#1a1a1a', border: `1px solid ${userIds.includes(userId) ? 'rgba(0,196,180,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '12px', padding: '2px 8px', fontSize: '13px', cursor: 'pointer', color: '#bbb' }}>
                        {emoji} <span style={{ fontSize: '11px', fontFamily: 'Barlow Condensed, sans-serif' }}>{userIds.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Hover actions */}
              {isHovered && !msg.optimistic && (
                <div style={{ position: 'absolute', right: 0, top: '-8px', display: 'flex', gap: '2px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '3px 6px', zIndex: 5 }}>
                  {QUICK_EMOJIS.slice(0, 4).map(e => (
                    <button key={e} onClick={() => toggleReaction(msg.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px', lineHeight: 1 }}>{e}</button>
                  ))}
                  <button onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '2px', lineHeight: 1, color: '#555' }}>+</button>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
                  <button onClick={() => { setReplyTo(msg); textareaRef.current?.focus() }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '2px 4px', lineHeight: 1, color: '#999', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.5px' }}>↩ Reply</button>
                  {msg.athlete_id === userId && msg.content && (
                    <>
                      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
                      <button onClick={() => { setEditingMsg(msg); setEditText(msg.content) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '2px 4px', lineHeight: 1, color: '#999', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.5px' }}>✏️ Edit</button>
                    </>
                  )}
                </div>
              )}

              {/* Full emoji picker */}
              {showEmojiPicker === msg.id && (
                <div style={{ position: 'absolute', bottom: '28px', right: 0, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px', width: '200px', zIndex: 10, boxShadow: '0 -4px 20px rgba(0,0,0,0.4)' }}>
                  {ALL_EMOJIS.map(e => (
                    <button key={e} onClick={() => toggleReaction(msg.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '3px', borderRadius: '4px' }}>{e}</button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '8px 16px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', background: '#111', flexShrink: 0 }}>
        {/* Reply banner */}
        {replyTo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px 6px 0 0', padding: '6px 12px', marginBottom: '-4px' }}>
            <span style={{ fontSize: '12px', color: '#555' }}>↩ Replying to</span>
            <span style={{ fontSize: '12px', color: '#00C4B4', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 600 }}>{replyTo.profiles?.full_name || 'Athlete'}</span>
            <span style={{ fontSize: '12px', color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.content}</span>
            <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#555', fontSize: '16px', cursor: 'pointer', padding: '0', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}

        {/* @mention dropdown */}
        {mentionQuery?.filtered?.length > 0 && (
          <div style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', marginBottom: '6px', overflow: 'hidden', maxHeight: '160px', overflowY: 'auto' }}>
            {mentionQuery.filtered.slice(0, 6).map((p, i) => (
              <button key={p.id} onClick={() => insertMention(p)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: i === mentionIndex ? 'rgba(0,196,180,0.1)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <Avatar profile={p} size={24} idx={i} />
                <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '14px', color: '#fff' }}>{p.full_name}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: replyTo ? '0 0 12px 12px' : '12px', padding: '8px 12px' }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
          <button onClick={() => fileRef.current.click()} style={{ background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer', padding: '0', lineHeight: 1, flexShrink: 0 }}>📎</button>
          <textarea
            ref={textareaRef}
            style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '14px', fontFamily: 'Barlow, sans-serif', outline: 'none', resize: 'none', lineHeight: 1.5, minHeight: '20px', maxHeight: '120px', padding: '0' }}
            placeholder={`Message #${channel.type === 'race' ? (channel.races?.name?.split(' ').pop() || channel.name) : channel.name} — type @ to mention`}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setShowInputEmoji(p => !p)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '0', lineHeight: 1 }}>😊</button>
            {showInputEmoji && (
              <div style={{ position: 'absolute', bottom: '30px', right: 0, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px', width: '200px', zIndex: 10, boxShadow: '0 -4px 20px rgba(0,0,0,0.4)' }}>
                {ALL_EMOJIS.map(e => (
                  <button key={e} onClick={() => { setText(p => p + e); setShowInputEmoji(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '3px', borderRadius: '4px' }}>{e}</button>
                ))}
              </div>
            )}
          </div>
          {(text.trim() || uploading) && (
            <button onClick={() => sendMessage()} disabled={sending || uploading}
              style={{ background: '#00C4B4', border: 'none', borderRadius: '8px', color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 700, letterSpacing: '1px', padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>
              {uploading ? '...' : sending ? '...' : 'Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function NewChannelModal({ session, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    const n = name.trim().toLowerCase().replace(/\s+/g, '-')
    if (!n) { setError('Please enter a channel name'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from('channels').insert({ name: n, type: 'topic', description: description.trim() || null, created_by: session.user.id }).select('*, races(name)').single()
    if (err) { setError(err.message); setSaving(false); return }
    onCreated(data)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderTop: '3px solid #00C4B4', borderRadius: '10px', padding: '2rem', width: '100%', maxWidth: '420px' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00C4B4', marginBottom: '1.5rem' }}>New Channel</div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: '6px' }}>Channel Name</label>
          <input style={{ width: '100%', background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff', padding: '10px 12px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', outline: 'none' }} placeholder="e.g. training-tips" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: '6px' }}>Description (optional)</label>
          <input style={{ width: '100%', background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff', padding: '10px 12px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', outline: 'none' }} placeholder="What's this channel about?" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        {error && <div style={{ color: '#FF3D8B', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase', padding: '10px 20px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px', color: '#999', cursor: 'pointer' }}>Cancel</button>
          <button onClick={create} disabled={saving} style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 24px', background: '#00C4B4', border: 'none', borderRadius: '5px', color: '#000', cursor: 'pointer' }}>{saving ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </div>
  )
}
