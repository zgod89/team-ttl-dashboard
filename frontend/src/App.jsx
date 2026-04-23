import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import MyRaces from './pages/MyRaces'
import Messaging from './pages/Messaging'
import ProfileSettings from './pages/ProfileSettings'
import CompleteProfile from './pages/CompleteProfile'
import Layout from './components/Layout'

function AppRoutes({ session, profile, setProfile }) {
  const [showProfileSettings, setShowProfileSettings] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => { loadUnreadCount() }, [])

  async function loadUnreadCount() {
    const userId = session.user.id
    const { data: channels } = await supabase.from('channels').select('id')
    const { data: reads } = await supabase.from('channel_reads').select('*').eq('athlete_id', userId)
    if (!channels) return
    const readsMap = {}
    reads?.forEach(r => { readsMap[r.channel_id] = r.last_read_at })
    let total = 0
    for (const ch of channels) {
      const lastRead = readsMap[ch.id]
      const query = supabase.from('messages').select('*', { count: 'exact', head: true }).eq('channel_id', ch.id)
      if (lastRead) query.gt('created_at', lastRead)
      const { count } = await query
      total += count || 0
    }
    setUnreadCount(total)
  }

  const handleProfileSave = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    if (data) setProfile(data)
    setShowProfileSettings(false)
  }

  if (showProfileSettings) {
    return <ProfileSettings session={session} onBack={handleProfileSave} />
  }

  return (
    <Layout session={session} profile={profile} onNavigateProfile={() => setShowProfileSettings(true)} unreadCount={unreadCount}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" />} />
        <Route path="/" element={<Home session={session} />} />
        <Route path="/races" element={<Dashboard session={session} />} />
        <Route path="/my-races" element={<MyRaces session={session} />} />
        <Route path="/messages" element={<Messaging session={session} profile={profile} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(null)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) checkProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) checkProfile(session.user.id)
      else { setHasProfile(null); setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function checkProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    const nameIsReal = data?.full_name && !data.full_name.includes('@') && data.full_name.length > 2
    setHasProfile(!!(data && nameIsReal))
    if (data) setProfile(data)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d' }}>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 18, letterSpacing: 3, color: '#aaa', textTransform: 'uppercase' }}>Loading...</div>
    </div>
  )

  if (!session) return <Login />

  if (!hasProfile) {
    return <CompleteProfile session={session} onComplete={async () => { await checkProfile(session.user.id) }} />
  }

  return (
    <BrowserRouter>
      <AppRoutes session={session} profile={profile} setProfile={setProfile} />
    </BrowserRouter>
  )
}
