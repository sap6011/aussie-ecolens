import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL

export default function Dashboard({ onUpload }) {
  const [stats, setStats] = useState({ total: 0, species: 0, images: 0, videos: 0 })
  const [recentFiles, setRecentFiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/query/species`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ species: [''] })
      })
      const data = await res.json()
      const files = data.results || []

      const images = files.filter(f => f.file_type === 'image').length
      const videos = files.filter(f => f.file_type === 'video').length
      const allTags = new Set(files.flatMap(f => Object.keys(f.tags || {})))

      setStats({
        total: files.length,
        species: allTags.size,
        images,
        videos
      })
      setRecentFiles(files.slice(0, 4))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">Your wildlife observation summary</div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Files</div>
          <div className="stat-value">{loading ? '...' : stats.total}</div>
          <div className="stat-meta">In database</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Species Tagged</div>
          <div className="stat-value">{loading ? '...' : stats.species}</div>
          <div className="stat-meta">Across all files</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Images</div>
          <div className="stat-value">{loading ? '...' : stats.images}</div>
          <div className="stat-meta">Auto-tagged</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Videos</div>
          <div className="stat-value">{loading ? '...' : stats.videos}</div>
          <div className="stat-meta">Frame-analysed</div>
        </div>
      </div>

      <div className="section-title">
        Recent uploads
        <a onClick={onUpload}>Upload new →</a>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--eco-muted)' }}>Loading...</div>
      ) : recentFiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--eco-muted)' }}>
          No files yet — upload your first wildlife photo!
        </div>
      ) : (
        <div className="file-grid">
          {recentFiles.map((f, i) => (
            <div className="file-card" key={i}>
              <div className={`file-thumb ${f.file_type === 'video' ? 'video' : ''}`}>
                {f.file_type === 'video' ? '🎬' : '🖼️'}
                <span className="file-badge">{f.file_type?.toUpperCase()}</span>
              </div>
              <div className="file-info">
                <div className="file-name">{f.file_url?.split('/').pop() || 'Unknown'}</div>
                <div className="file-tags">{Object.keys(f.tags || {}).join(', ') || 'No tags'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}