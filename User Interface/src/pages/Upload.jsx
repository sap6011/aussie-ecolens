import { useState, useRef } from 'react'

const API = import.meta.env.VITE_API_URL

async function computeSHA256(file) {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function Upload() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null) // null | 'success' | 'duplicate' | 'error'
  const [statusMsg, setStatusMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadStage, setUploadStage] = useState('')
  const inputRef = useRef()

  function handleFile(e) {
    if (e.target.files[0]) { setFile(e.target.files[0]); setStatus(null) }
  }

  function handleDrop(e) {
    e.preventDefault()
    if (e.dataTransfer.files[0]) { setFile(e.dataTransfer.files[0]); setStatus(null) }
  }

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setStatus(null)

    try {
      const token = localStorage.getItem('token')

      // Step 1 — compute SHA-256 in browser (instant, no ML)
      setUploadStage('checking')
      const checksum = await computeSHA256(file)

      // Step 2 — check DynamoDB for matching checksum via /check-duplicate
      const dupRes = await fetch(`${API}/check-duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ checksum })
      })
      const dupData = await dupRes.json()

      if (dupData.duplicate) {
        setStatus('duplicate')
        setStatusMsg(`This file already exists in your library as "${dupData.existing_file}". Duplicate uploads are blocked.`)
        setLoading(false)
        setUploadStage('')
        return
      }

      // Step 3 — get presigned URL
      setUploadStage('uploading')
      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content_type: file.type })
      })
      const { upload_url } = await res.json()

      // Step 4 — upload directly to S3
      await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      })

      setFile(null)
      setStatus('success')
      setStatusMsg(`"${file.name}" uploaded successfully — species detection in progress.`)
      setTimeout(() => setStatus(null), 6000)

    } catch (err) {
      setStatus('error')
      setStatusMsg(err.message)
    } finally {
      setLoading(false)
      setUploadStage('')
    }
  }

  const isVideo = file?.type?.startsWith('video')

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Upload Files</div>
        <div className="page-subtitle">Images and videos are auto-tagged on upload</div>
      </div>

      {status === 'success' && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Upload successful!</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{statusMsg}</div>
          </div>
        </div>
      )}

      {status === 'duplicate' && (
        <div style={{
          background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10,
          padding: '14px 18px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#e65100', marginBottom: 2 }}>
              Duplicate detected
            </div>
            <div style={{ fontSize: 12, color: '#bf360c' }}>{statusMsg}</div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          background: '#fff3f3', border: '1px solid #ffcdd2', borderRadius: 10,
          padding: '14px 18px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 22 }}>❌</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#c62828', marginBottom: 2 }}>Upload failed</div>
            <div style={{ fontSize: 12, color: '#c62828' }}>{statusMsg}</div>
          </div>
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
        <div style={{
          background: 'var(--eco-surface)', border: '1px solid var(--eco-border)',
          borderRadius: 8, padding: 12,
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem'
        }}>
          <div style={{
            width: 48, height: 48, background: '#e8f5e9', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
          }}>
            {isVideo ? '🎬' : '🖼️'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</div>
            <div style={{ fontSize: 11, color: 'var(--eco-muted)' }}>
              {(file.size / 1024 / 1024).toFixed(2)} MB
              {uploadStage === 'checking' && (
                <span style={{ marginLeft: 8, color: 'var(--eco-primary)' }}>Checking for duplicates…</span>
              )}
              {uploadStage === 'uploading' && (
                <span style={{ marginLeft: 8, color: 'var(--eco-primary)' }}>Uploading…</span>
              )}
            </div>
          </div>
          <button className="btn-add" onClick={handleUpload} disabled={loading}>
            {uploadStage === 'checking' ? 'Checking…'
              : uploadStage === 'uploading' ? 'Uploading…'
              : 'Upload'}
          </button>
        </div>
      )}

      <div className="section-title" style={{ marginTop: '1.5rem' }}>How it works</div>
      <div className="how-grid">
        <div className="how-card">
          <div className="how-icon">📤</div>
          <div className="how-title">1. Upload</div>
          <div className="how-desc">File stored securely with SHA-256 checksum duplicate detection</div>
        </div>
        <div className="how-card">
          <div className="how-icon">🤖</div>
          <div className="how-title">2. Auto-tag</div>
          <div className="how-desc">ML model detects species and generates tags automatically</div>
        </div>
        <div className="how-card">
          <div className="how-icon">🔍</div>
          <div className="how-title">3. Search</div>
          <div className="how-desc">Query by species, tags, thumbnail URL or upload a sample file</div>
        </div>
      </div>
    </div>
  )
}