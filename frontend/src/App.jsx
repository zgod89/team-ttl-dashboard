import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Messaging from './pages/Messaging'
import Discounts from './pages/Discounts'
import ProfilePage from './pages/ProfilePage'
import CompleteProfile from './pages/CompleteProfile'
import Training from './pages/Training'
import Layout from './components/Layout'

function AppRoutes({ session, profile, setProfile }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => { 
    loadUnreadCount()
    // Refresh every 30 seconds
    const interval = setInterval(loadUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadUnreadCount() {
    const { data, error } = await supabase.rpc('get_unread_count', { p_user_id: session.user.id })
    if (!error) setUnreadCount(data || 0)
  }

  const handleProfileSave = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    if (data) setProfile(data)
  }

  return (
    <Layout
      session={session}
      profile={profile}
      onNavigateProfile={() => navigate('/profile')}
      unreadCount={unreadCount}
    >
      <Routes>
        <Route path="/login" element={<Navigate to="/" />} />
        <Route path="/" element={<Home session={session} />} />
        <Route path="/races" element={<Dashboard session={session} />} />
        <Route path="/training" element={<Training session={session} profile={profile} />} />
        <Route path="/messages" element={<Messaging session={session} profile={profile} onReadChannel={loadUnreadCount} />} />
        <Route path="/discounts" element={<Discounts profile={profile} />} />
        <Route path="/profile" element={<ProfilePage session={session} profile={profile} onSave={handleProfileSave} />} />
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

  if (!hasProfile) return <CompleteProfile session={session} onComplete={async () => { await checkProfile(session.user.id) }} />

  return (
    <BrowserRouter>
      <AppRoutes session={session} profile={profile} setProfile={setProfile} />
    </BrowserRouter>
  )
}
