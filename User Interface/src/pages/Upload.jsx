import { useState, useRef } from 'react'

const API = 'https://1gwype1nc4.execute-api.us-east-1.amazonaws.com/prod'

export default function Upload() {
  const [file, setFile] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef()

  function handleFile(e) {
    if (e.target.files[0]) setFile(e.target.files[0])
  }

  function handleDrop(e) {
    e.preventDefault()
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0])
  }

async function handleUpload() {
    if (!file) return
    setLoading(true)
    try {
      const token = localStorage.getItem('token')

      // Step 1 — Get presigned URL from Lambda
      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type
        })
      })
      const { upload_url } = await res.json()

      // Step 2 — Upload file directly to S3
      await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      })

      setFile(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isVideo = file?.type?.startsWith('video')

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Upload Files</div>
        <div className="page-subtitle">Images and videos are auto-tagged on upload</div>
      </div>

      {success && (
        <div className="alert alert-success">
          ✅ File uploaded successfully — species detection in progress.
        </div>
      )}

      <div
        className="upload-zone"
        onClick={() => inputRef.current.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        <div className="upload-icon">☁️</div>
        <div className="upload-title">Drop files here or click to browse</div>
        <div className="upload-sub">
          Supports <strong>JPG, PNG, MP4, MOV</strong> — duplicates detected via checksum
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleFile} />

      {file && (
        <div style={{ background: 'var(--eco-surface)', border: '1px solid var(--eco-border)', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
          <div style={{ width: 48, height: 48, background: '#e8f5e9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
            {isVideo ? '🎬' : '🖼️'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</div>
            <div style={{ fontSize: 11, color: 'var(--eco-muted)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
          <button className="btn-add" onClick={handleUpload} disabled={loading}>
            {loading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      )}

      <div className="section-title" style={{ marginTop: '1.5rem' }}>How it works</div>
      <div className="how-grid">
        <div className="how-card">
          <div className="how-icon">📤</div>
          <div className="how-title">1. Upload</div>
          <div className="how-desc">File is stored securely with duplicate detection</div>
        </div>
        <div className="how-card">
          <div className="how-icon">🤖</div>
          <div className="how-title">2. Auto-tag</div>
          <div className="how-desc">ML model detects species and generates tags</div>
        </div>
        <div className="how-card">
          <div className="how-icon">🔍</div>
          <div className="how-title">3. Search</div>
          <div className="how-desc">Query by species, tags, or upload a sample file</div>
        </div>
      </div>
    </div>
  )
}