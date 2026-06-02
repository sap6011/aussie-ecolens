import { useState } from 'react'
import './App.css'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Query from './pages/Query'
import ManageTags from './pages/ManageTags'
import Notifications from './pages/Notifications'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞', section: 'Main' },
  { id: 'upload', label: 'Upload', icon: '↑', section: 'Main' },
  { id: 'query', label: 'Query Files', icon: '⌕', section: 'Search' },
  { id: 'tags', label: 'Manage Tags', icon: '⊕', section: 'Manage' },
  { id: 'notifications', label: 'Notifications', icon: '🔔', section: 'Manage' },
]

export default function App() 
{
  const [page, setPage] = useState(() => localStorage.getItem('token') ? 'app' : 'login')
const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'dashboard')
const [user, setUser] = useState(() => {
  const token = localStorage.getItem('token')
  return token ? { email: localStorage.getItem('userEmail') || 'User' } : null
})

  function handleLogin(userData) {
  setUser(userData)
  localStorage.setItem('userEmail', userData.email)
  setPage('app')
}
function handleTabChange(tabId) {
  setActiveTab(tabId)
  localStorage.setItem('activeTab', tabId)
}
  function handleLogout() {
  setUser(null)
  localStorage.removeItem('token')
  localStorage.removeItem('userEmail')
  setPage('login')
}

  if (page === 'login') return <Login onLogin={handleLogin} onSignup={() => setPage('signup')} />
  if (page === 'signup') return <Signup onSignup={handleLogin} onLogin={() => setPage('login')} />

  const sections = [...new Set(NAV_ITEMS.map(i => i.section))]

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand"> EcoLens <span>Wildlife Platform</span></div>
        <div className="nav-user">{user?.email}</div>
        <button className="nav-btn" onClick={handleLogout}>Sign out</button>
      </nav>
      <div className="layout">
        <aside className="sidebar">
          {sections.map(section => (
            <div key={section}>
              <div className="sidebar-section">{section}</div>
              {NAV_ITEMS.filter(i => i.section === section).map(item => (
                <div
                  key={item.id}
                  className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(item.id)}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </aside>
        <main className="content">
          {activeTab === 'dashboard' && <Dashboard onUpload={() => handleTabChange('upload')} token={localStorage.getItem('token')} />}
          {activeTab === 'upload' && <Upload />}
          {activeTab === 'query' && <Query />}
          {activeTab === 'tags' && <ManageTags />}
          {activeTab === 'notifications' && <Notifications />}
        </main>
      </div>
    </div>
  )
}