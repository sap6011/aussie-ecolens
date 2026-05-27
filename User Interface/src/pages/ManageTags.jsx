import { useState, useEffect } from 'react'

const API = VITE_API_URL

export default function ManageTags() {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState([])
  const [bulkTags, setBulkTags] = useState('')
  const [bulkOp, setBulkOp] = useState('1')
  const [alert, setAlert] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [])

  async function loadFiles() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/query/species`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ species: [''] })
      })
      const data = await res.json()
      setFiles(data.results || [])
    } catch (err) {
      console.error(err)
    }
  }

  function toggleSelect(url) {
    setSelected(s => s.includes(url) ? s.filter(x => x !== url) : [...s, url])
  }

  async function applyBulk() {
    if (!bulkTags.trim()) return
    setLoading(true)
    const tags = bulkTags.split(',').map(t => t.trim()).filter(Boolean)
    const urls = selected.length > 0 ? selected : files.map(f => f.file_url || f.original_url)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/tags`, {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, tags, operation: parseInt(bulkOp) })
      })
      if (!res.ok) throw new Error('Failed to update tags')
      setAlert(`${bulkOp === '1' ? 'Added' : 'Removed'} tags: ${tags.join(', ')}`)
      setBulkTags('')
      setTimeout(() => setAlert(''), 3000)
      loadFiles()
    } catch (err) {
      setAlert(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteFile(url) {
    try {
      const token = localStorage.getItem('token')
      await fetch(`${API}/delete`, {
        method: 'DELETE',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] })
      })
      loadFiles()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Manage Tags</div>
        <div className="page-subtitle">Add or remove species tags from files in bulk</div>
      </div>

      {alert && <div className="alert alert-success">✅ {alert}</div>}

      <div className="bulk-bar">
        <div className="bulk-bar-title">Bulk tag operation {selected.length > 0 && `(${selected.length} selected)`}</div>
        <div className="bulk-row">
          <input
            placeholder="Tags (comma-separated): koala, wombat"
            value={bulkTags}
            onChange={e => setBulkTags(e.target.value)}
          />
          <select value={bulkOp} onChange={e => setBulkOp(e.target.value)}>
            <option value="1">Add tags</option>
            <option value="0">Remove tags</option>
          </select>
          <button className="btn-add" onClick={applyBulk} disabled={loading}>
            {loading ? 'Applying...' : 'Apply'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--eco-muted)', marginTop: 6 }}>
          {selected.length === 0 ? 'No files selected — operation will apply to all files' : `Applying to ${selected.length} selected file(s)`}
        </div>
      </div>

      {files.map((f, i) => {
        const url = f.file_url || f.original_url
        const tags = f.tags ? Object.keys(f.tags) : []
        return (
          <div className="file-list-item" key={i}>
            <input type="checkbox" checked={selected.includes(url)} onChange={() => toggleSelect(url)} />
            <div className={`file-list-thumb ${f.file_type === 'video' ? 'video' : ''}`}>
              {f.file_type === 'video' ? '🎬' : '🖼️'}
            </div>
            <div className="file-list-info">
              <div className="file-list-name">{url?.split('/').pop()}</div>
              <div className="file-list-tags">
                {tags.map(tag => (
                  <span key={tag} className="tag-pill">{tag}</span>
                ))}
                {tags.length === 0 && <span style={{ fontSize: 11, color: 'var(--eco-muted)' }}>No tags</span>}
              </div>
            </div>
            <button className="btn-danger" onClick={() => deleteFile(url)}>🗑</button>
          </div>
        )
      })}

      {files.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--eco-muted)', fontSize: 13 }}>
          No files found.
        </div>
      )}
    </div>
  )
}