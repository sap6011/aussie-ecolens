import { useState, useRef } from 'react'

const API = import.meta.env.VITE_API_URL

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
  const [searched, setSearched] = useState(false)
  const fileRef = useRef()

  function setInput(key, val) {
    setInputs(i => ({ ...i, [key]: val }))
  }

  function getToken() {
    return localStorage.getItem("token")
  }

  function getThumbSrc(url) {
    if (!url) return null
    return url.startsWith("s3://")
      ? url.replace(
          /^s3:\/\/aussie-ecolens-media-169\/thumbnails\//,
          "https://storage.googleapis.com/aussie-ecolens-thumbnails/thumbnails/"
        )
      : url
  }

  async function runQuery() {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setSearched(true)

    try {
      let res, data

      if (activeTab === 'species') {
        res = await fetch(`${API_BASE}/query/species`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ species: [inputs.species.trim()] })
        })
        data = await res.json()
        setResults(data.results || [])

      } else if (activeTab === 'tags') {
        // parse "koala:3, wombat:2" into { koala: 3, wombat: 2 }
        const tagMap = {}
        inputs.tags.split(",").forEach(part => {
          const [k, v] = part.trim().split(":")
          if (k) tagMap[k.trim()] = parseInt(v?.trim() || "1")
        })
        res = await fetch(`${API_BASE}/query/tags`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ tags: tagMap })
        })
        data = await res.json()
        setResults(data.results || [])

      } else if (activeTab === 'url') {
        res = await fetch(`${API_BASE}/query/thumbnail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ thumbnail_url: inputs.url.trim() })
        })
        data = await res.json()
        setResults(data.original_url ? [{ original_url: data.original_url }] : [])

      } else if (activeTab === 'file') {
        const formData = new FormData()
        formData.append("file", inputs.file)
        res = await fetch(`${API_BASE}/query/file`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })
        data = await res.json()
        setResults(data.results || [])
      }

    } catch (err) {
      console.error("Query error:", err)
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
            <button key={t.id} className={`qtab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(t.id); setResults([]); setSearched(false) }}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'species' && (
          <>
            <div className="query-hint">Enter a species name to find all files containing it</div>
            <div className="query-row">
              <input className="query-input" placeholder="e.g. Casuarius casuarius"
                value={inputs.species} onChange={e => setInput('species', e.target.value)} />
              <button className="btn-search" onClick={runQuery}>🔍 Search</button>
            </div>
          </>
        )}

        {activeTab === 'tags' && (
          <>
            <div className="query-hint">Specify species with minimum counts (AND logic). e.g. <code>koala:3, wombat:2</code></div>
            <div className="query-row">
              <input className="query-input" placeholder="koala:3, wombat:2"
                value={inputs.tags} onChange={e => setInput('tags', e.target.value)} />
              <button className="btn-search" onClick={runQuery}>🔍 Search</button>
            </div>
          </>
        )}

        {activeTab === 'url' && (
          <>
            <div className="query-hint">Paste a thumbnail URL to find the full-size image</div>
            <div className="query-row">
              <input className="query-input" placeholder="https://storage.googleapis.com/..."
                value={inputs.url} onChange={e => setInput('url', e.target.value)} />
              <button className="btn-search" onClick={runQuery}>🔍 Search</button>
            </div>
          </>
        )}

        {activeTab === 'file' && (
          <>
            <div className="query-hint">Upload a file — EcoLens finds all matching files</div>
            <div className="query-row">
              <input className="query-input" placeholder="Click to select a file..."
                value={inputs.file?.name || ''} readOnly onClick={() => fileRef.current.click()}
                style={{ cursor: 'pointer' }} />
              <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }}
                onChange={e => setInput('file', e.target.files[0] || null)} />
              <button className="btn-search" onClick={runQuery}>🔍 Search</button>
            </div>
          </>
        )}
      </div>

      {searched && (
        <div className="section-title">Results ({results.length} found)</div>
      )}

      <div className="results-grid">
        {loading && <p>Searching...</p>}
        {!loading && searched && results.length === 0 && <p>No results found.</p>}
        {!loading && results.map((r, i) => {
          const name = r.thumbnail_url?.split("/").pop()?.replace("_thumb.jpg", ".JPG")
            || r.original_url?.split("/").pop() || "file"
          const tags = Object.keys(r.tags || {})
          const thumbSrc = getThumbSrc(r.thumbnail_url)
          return (
            <div className="result-card" key={i}>
              <div className="result-img">
                {thumbSrc
                  ? <img src={thumbSrc} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : "🖼️"}
              </div>
              <div className="result-body">
                <div className="result-name">{name}</div>
                <div>{tags.map(t => <span key={t} className="tag-pill">{t}</span>)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}