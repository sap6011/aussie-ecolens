import { useState, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL
const GCP_QUERY_URL = import.meta.env.VITE_GCP_QUERY_URL

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
  const [lightbox, setLightbox] = useState(null)
  const [lightboxLoading, setLightboxLoading] = useState(false)
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
          `s3://${import.meta.env.VITE_MEDIA_BUCKET}/thumbnails/`,
          `https://storage.googleapis.com/${import.meta.env.VITE_GCP_BUCKET_NAME}/thumbnails/`
        )
      : url
  }

  async function openLightbox(fileUrl, name) {
    if (!fileUrl) return
    setLightboxLoading(true)
    setLightbox({ src: null, name })
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE}/presign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ file_url: fileUrl })
      })
      const data = await res.json()
      if (data.presigned_url) setLightbox({ src: data.presigned_url, name })
    } catch (err) {
      console.error("Failed to get presigned URL:", err)
      setLightbox(null)
    } finally {
      setLightboxLoading(false)
    }
  }

  function closeLightbox(e) {
    if (e.target === e.currentTarget) setLightbox(null)
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
        res = await fetch(`${GCP_QUERY_URL}/query/thumbnail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ thumbnail_url: inputs.url.trim() })
        })
        data = await res.json()
        setResults(data.original_url ? [data] : [])

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
      {/* Lightbox */}
      {lightbox !== null && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(6px)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute', top: 20, right: 28,
              background: 'rgba(255,255,255,0.12)', border: 'none',
              color: '#fff', fontSize: 26, width: 44, height: 44,
              borderRadius: '50%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>

          {lightboxLoading || !lightbox.src ? (
            <div style={{ color: '#fff', fontSize: 14, opacity: 0.7 }}>Loading full-size image...</div>
          ) : (
            <>
              <img
                src={lightbox.src}
                alt={lightbox.name}
                style={{
                  maxWidth: '90vw', maxHeight: '82vh',
                  borderRadius: 10,
                  boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
                  animation: 'fadeIn 0.25s ease',
                }}
              />
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 14 }}>
                {lightbox.name} &nbsp;·&nbsp; Click outside to close
              </div>
            </>
          )}
        </div>
      )}

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
          const fullUrl = r.original_url || r.file_url
          const isVideo = r.file_type === 'video'
          return (
            <div
              className="result-card"
              key={i}
              onClick={() => !isVideo && openLightbox(fullUrl, name)}
              style={{ cursor: isVideo ? 'default' : 'pointer' }}
              title={isVideo ? '' : 'Click to view full-size'}
            >
              <div className="result-img" style={{ position: 'relative', overflow: 'hidden' }}>
                {thumbSrc
                  ? <img src={thumbSrc} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : "🖼️"}
                {!isVideo && (
                  <div className="result-overlay" style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, transition: 'background 0.2s',
                  }}>🔍</div>
                )}
              </div>
              <div className="result-body">
                <div className="result-name">{name}</div>
                <div>{tags.map(t => <span key={t} className="tag-pill">{t}</span>)}</div>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        .result-card:hover .result-overlay { background: rgba(0,0,0,0.35) !important; color: white; }
      `}</style>
    </div>
  )
}