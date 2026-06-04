import { useState, useEffect } from "react"

const API_BASE = import.meta.env.VITE_API_URL

export default function Dashboard({ onUpload }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, images: 0, videos: 0, species: 0 })
  const [lightbox, setLightbox] = useState(null) // { src, name }
  const [lightboxLoading, setLightboxLoading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) { setLoading(false); return }

    fetch(`${API_BASE}/query/tags`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tags: {} })
    })
      .then(r => r.json())
      .then(data => {
        const items = data.results || []
        setFiles(items.slice(0, 8))
        const images = items.filter(f => !f.file_url?.match(/\.(mp4|mov|avi)$/i)).length
        const videos = items.length - images
        const allSpecies = new Set(items.flatMap(f => Object.keys(f.tags || {})))
        setStats({ total: items.length, images, videos, species: allSpecies.size })
      })
      .catch(err => console.error("Fetch error:", err))
      .finally(() => setLoading(false))
  }, [])

  async function openLightbox(fileUrl, name) {
    if (!fileUrl) return
    setLightboxLoading(true)
    setLightbox({ src: null, name })
    try {
      const token = localStorage.getItem("token")
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

          {/* Close button */}
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

          {/* Image or spinner */}
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
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">Your wildlife observation summary</div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Files</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Species Tagged</div>
          <div className="stat-value">{stats.species}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Images</div>
          <div className="stat-value">{stats.images}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Videos</div>
          <div className="stat-value">{stats.videos}</div>
        </div>
      </div>

      <div className="section-title">
        Recent uploads
        <a onClick={onUpload}>Upload new →</a>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="file-grid">
          {files.map(f => {
            const name = f.thumbnail_url?.split("/").pop()?.replace("_thumb.jpg", ".JPG") || f.original_url?.split("/").pop() || f.file_url?.split("/").pop() || "file"
            const tagKeys = Object.keys(f.tags || {})
            const isVideo = f.file_type === "video" || name.match(/\.(mp4|mov|avi)$/i)
            const thumbSrc = f.thumbnail_url?.startsWith("s3://")
              ? f.thumbnail_url.replace(
                  `s3://${import.meta.env.VITE_MEDIA_BUCKET}/thumbnails/`,
                  `https://storage.googleapis.com/${import.meta.env.VITE_GCP_BUCKET_NAME}/thumbnails/`
                )
              : f.thumbnail_url
            return (
              <div
                className="file-card"
                key={f.file_url || f.fileId}
                onClick={() => !isVideo && openLightbox(f.original_url || f.file_url, name)}
                style={{ cursor: isVideo ? "default" : "pointer" }}
                title={isVideo ? "" : "Click to view full-size"}
              >
                <div className={`file-thumb ${isVideo ? "video" : ""}`}
                  style={{ position: 'relative', overflow: 'hidden' }}>
                  {thumbSrc ? (
                    <img src={thumbSrc} alt={name}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
                  ) : (
                    isVideo ? "🎬" : "🖼️"
                  )}
                  {/* Hover overlay for images */}
                  {!isVideo && (
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: 8,
                      background: 'rgba(0,0,0,0)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.2s',
                      fontSize: 22,
                    }}
                      className="thumb-overlay"
                    >🔍</div>
                  )}
                  <span className="file-badge">{isVideo ? "VIDEO" : "IMAGE"}</span>
                </div>
                <div className="file-info">
                  <div className="file-name">{name}</div>
                  <div className="file-tags">
                    {tagKeys.length > 0
                      ? tagKeys.map(t => <span key={t} className="tag-pill" style={{ fontSize: 10, padding: "1px 6px", marginRight: 3 }}>{t}</span>)
                      : <span style={{ color: "var(--eco-muted)", fontSize: 11 }}>No tags yet</span>
                    }
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        .file-card:hover .thumb-overlay { background: rgba(0,0,0,0.35) !important; }
        .file-card:hover .thumb-overlay { color: white; }
      `}</style>
    </div>
  )
}