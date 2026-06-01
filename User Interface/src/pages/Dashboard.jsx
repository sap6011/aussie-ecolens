import { useState, useEffect } from "react"

const API_BASE = import.meta.env.VITE_API_URL

export default function Dashboard({ onUpload }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, images: 0, videos: 0, species: 0 })

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      console.log("No token found")
      setLoading(false)
      return
    }

    fetch(`${API_BASE}/query/tags`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ tags: {} })
    })
      .then(r => {
        console.log("Response status:", r.status)
        return r.json()
      })
      .then(data => {
        console.log("API response:", data)
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

  return (
    <div>
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
            const name = f.thumbnail_url?.split("/").pop()?.replace("_thumb.jpg", ".JPG") || "file"
            const tags = f.file_type || ""
            const isVideo = name.match(/\.(mp4|mov|avi)$/i)
            const thumbSrc = f.thumbnail_url?.startsWith("s3://")
  ? f.thumbnail_url.replace(
      /^s3:\/\/aussie-ecolens-media-169\/thumbnails\//,
      "https://storage.googleapis.com/aussie-ecolens-thumbnails/thumbnails/"
    )
  : f.thumbnail_url
            return (
              <div className="file-card" key={f.file_url || f.fileId}>
                <div className={`file-thumb ${isVideo ? "video" : ""}`}>
                  {thumbSrc ? (
                    <img src={thumbSrc} alt={name}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
                  ) : (
                    isVideo ? "🎬" : "🖼️"
                  )}
                  <span className="file-badge">{isVideo ? "VIDEO" : "IMAGE"}</span>
                </div>
                <div className="file-info">
                  <div className="file-name">{name}</div>
                  <div className="file-tags">{tags || "No tags yet"}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}