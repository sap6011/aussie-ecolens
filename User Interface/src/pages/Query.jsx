import { useState, useRef } from 'react'

const API = VITE_API_URL

const TABS = [
  { id: 'species', label: 'By species' },
  { id: 'tags', label: 'By tag count' },
  { id: 'url', label: 'By thumbnail URL' },
  { id: 'file', label: 'By file content' },
]

export default function Query() {
  const [activeTab, setActiveTab] = useState('species')
  const [results, setResults] = useState([])
  const [inputs, setInputs] = useState({ species: '', tags: '', url: '', file: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  function setInput(key, val) {
    setInputs(i => ({ ...i, [key]: val }))
  }

  async function runQuery() {
    setLoading(true)
    setError('')
    setResults([])
    const token = localStorage.getItem('token')
    try {
      let res, body

      if (activeTab === 'species') {
        res = await fetch(`${API}/query/species`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ species: [inputs.species] })
        })
      } else if (activeTab === 'tags') {
        const parsed = {}
        inputs.tags.split(',').forEach(t => {
          const [k, v] = t.trim().split(':')
          if (k) parsed[k.trim()] = parseInt(v) || 1
        })
        res = await fetch(`${API}/query/tags`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: parsed })
        })
      } else if (activeTab === 'url') {
        res = await fetch('https://query-thumbnail-776210689330.us-central1.run.app', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ thumbnail_url: inputs.url })
        })
      } else if (activeTab === 'file') {
        const formData = new FormData()
        formData.append('file', inputs.file)
        res = await fetch(`${API}/query/file`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        })
      }

      body = await res.json()
      setResults(body.results || [body] || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Query Files</div>
        <div className="page-subtitle">Search your media by species, tags, or URL</div>
      </div>

      <div className="query-card">
        <div className="query-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`qtab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'species' && (
          <>
            <div className="query-hint">Enter a species name to find all files containing it</div>
            <div className="query-row">
              <input className="query-input" placeholder="e.g. dingo" value={inputs.species} onChange={e => setInput('species', e.target.value)} />
            </div>
          </>
        )}

        {activeTab === 'tags' && (
          <>
            <div className="query-hint">Enter tags with counts e.g. kangaroo:2, wombat:1</div>
            <div className="query-row">
              <input className="query-input" placeholder="e.g. kangaroo:2, wombat:1" value={inputs.tags} onChange={e => setInput('tags', e.target.value)} />
            </div>
          </>
        )}

        {activeTab === 'url' && (
          <>
            <div className="query-hint">Enter a thumbnail URL to get the full image</div>
            <div className="query-row">
              <input className="query-input" placeholder="https://storage.googleapis.com/..." value={inputs.url} onChange={e => setInput('url', e.target.value)} />
            </div>
          </>
        )}

        {activeTab === 'file' && (
          <>
            <div className="query-hint">Upload a file to find similar tagged files</div>
            <div className="query-row">
              <button className="btn-add" onClick={() => fileRef.current.click()}>
                {inputs.file ? inputs.file.name : 'Choose file'}
              </button>
              <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => setInput('file', e.target.files[0])} />
            </div>
          </>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn-primary" onClick={runQuery} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div>
          <div className="section-title">{results.length} result(s) found</div>
          <div className="results-grid">
            {results.map((r, i) => (
              <div key={i} className="result-card">
                {r.thumbnail_url && (
                  <img src={r.thumbnail_url} alt="thumbnail" style={{ width: '100%', borderRadius: 6 }} />
                )}
                <div style={{ padding: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--eco-muted)' }}>{r.file_type}</div>
                  <a href={r.original_url || r.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    View full file
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}