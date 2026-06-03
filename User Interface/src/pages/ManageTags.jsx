import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL

export default function ManageTags() {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState([])
  const [bulkTags, setBulkTags] = useState('')
  const [bulkOp, setBulkOp] = useState('1')
  const [alert, setAlert] = useState({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)
  const [filesLoading, setFilesLoading] = useState(true)

  useEffect(() => { loadFiles() }, [])

  async function loadFiles() {
    setFilesLoading(true)
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
    } finally {
      setFilesLoading(false)
    }
  }

  function toggleSelect(url) {
    setSelected(s => s.includes(url) ? s.filter(x => x !== url) : [...s, url])
  }

  function selectAll() {
    const allUrls = files.map(f => f.file_url || f.original_url)
    setSelected(selected.length === files.length ? [] : allUrls)
  }

  function showAlert(msg, type = 'success') {
    setAlert({ msg, type })
    setTimeout(() => setAlert({ msg: '', type: '' }), 3000)
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
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, tags, operation: parseInt(bulkOp) })
      })
      if (!res.ok) throw new Error('Failed to update tags')
      showAlert(`${bulkOp === '1' ? '✅ Added' : '🗑 Removed'} tags: ${tags.join(', ')} on ${urls.length} file(s)`)
      setBulkTags('')
      setSelected([])
      loadFiles()
    } catch (err) {
      showAlert(`❌ ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function deleteFile(url, name) {
    if (!window.confirm(`Delete ${name}?`)) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/delete`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] })
      })
      if (!res.ok) throw new Error('Delete failed')
      showAlert(`🗑 Deleted ${name}`)
      setSelected(s => s.filter(u => u !== url))
      loadFiles()
    } catch (err) {
      showAlert(`❌ ${err.message}`, 'error')
    }
  }

  const allSelected = files.length > 0 && selected.length === files.length

  return (
    <div>
      <style>{`
        .mt-file-row {
          display: flex; align-items: center; gap: 14px;
          background: var(--eco-surface);
          border: 1px solid var(--eco-border);
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 8px;
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .mt-file-row:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.07); border-color: #b5c9b0; }
        .mt-file-row.selected { border-color: var(--eco-primary); background: #f0f7ee; }
        .mt-thumb {
          width: 52px; height: 52px; border-radius: 8px;
          overflow: hidden; flex-shrink: 0;
          background: #e8f5e9; display: flex; align-items: center; justifyContent: center;
        }
        .mt-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .mt-check {
          width: 18px; height: 18px; flex-shrink: 0;
          accent-color: var(--eco-primary); cursor: pointer;
        }
        .mt-tag { 
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; padding: 2px 8px; border-radius: 12px;
          background: #e8f5e9; color: #2d5a27; border: 1px solid #c8e6c9;
          margin: 2px;
        }
        .mt-filename { font-size: 13px; font-weight: 600; color: var(--eco-text); margin-bottom: 4px; }
        .mt-meta { font-size: 11px; color: var(--eco-muted); margin-bottom: 4px; }
        .mt-del-btn {
          margin-left: auto; flex-shrink: 0;
          background: none; border: 1px solid #ffcdd2;
          color: #e53935; width: 34px; height: 34px; border-radius: 8px;
          cursor: pointer; font-size: 15px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
        }
        .mt-del-btn:hover { background: #ffebee; }
        .mt-bulk-card {
          background: var(--eco-surface);
          border: 1px solid var(--eco-border);
          border-radius: 12px; padding: 18px 20px; margin-bottom: 20px;
        }
        .mt-bulk-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px;
        }
        .mt-bulk-title { font-size: 14px; font-weight: 600; color: var(--eco-text); }
        .mt-select-all {
          font-size: 12px; color: var(--eco-primary); cursor: pointer;
          background: none; border: none; padding: 0; text-decoration: underline;
        }
        .mt-input-row { display: flex; gap: 8px; align-items: center; }
        .mt-input-row input {
          flex: 1; padding: 9px 12px; border-radius: 8px;
          border: 1px solid var(--eco-border); font-size: 13px;
          background: #fff; outline: none;
        }
        .mt-input-row input:focus { border-color: var(--eco-primary); }
        .mt-input-row select {
          padding: 9px 10px; border-radius: 8px;
          border: 1px solid var(--eco-border); font-size: 13px;
          background: #fff; outline: none; cursor: pointer;
        }
        .mt-apply-btn {
          padding: 9px 20px; border-radius: 8px;
          background: var(--eco-primary); color: #fff;
          border: none; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: opacity 0.15s; white-space: nowrap;
        }
        .mt-apply-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .mt-apply-btn:hover:not(:disabled) { opacity: 0.88; }
        .mt-hint { font-size: 11px; color: var(--eco-muted); margin-top: 8px; }
        .mt-alert {
          padding: 10px 16px; border-radius: 8px; font-size: 13px;
          margin-bottom: 14px; border: 1px solid;
        }
        .mt-alert.success { background: #f0f7ee; border-color: #c8e6c9; color: #2d5a27; }
        .mt-alert.error   { background: #fff3f3; border-color: #ffcdd2; color: #c62828; }
        .mt-empty { text-align: center; padding: 3rem; color: var(--eco-muted); font-size: 13px; }
        .mt-list-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        .mt-count { font-size: 13px; font-weight: 600; color: var(--eco-text); }
        .mt-selected-count { font-size: 12px; color: var(--eco-primary); }
      `}</style>

      <div className="page-header">
        <div className="page-title">Manage Tags</div>
        <div className="page-subtitle">Add or remove species tags from your files in bulk</div>
      </div>

      {/* Alert */}
      {alert.msg && (
        <div className={`mt-alert ${alert.type || 'success'}`}>{alert.msg}</div>
      )}

      {/* Bulk operation card */}
      <div className="mt-bulk-card">
        <div className="mt-bulk-header">
          <div className="mt-bulk-title">
            Bulk tag operation
            {selected.length > 0 && (
              <span className="mt-selected-count" style={{ marginLeft: 8 }}>
                ({selected.length} file{selected.length > 1 ? 's' : ''} selected)
              </span>
            )}
          </div>
          <button className="mt-select-all" onClick={selectAll}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="mt-input-row">
          <input
            placeholder="Tags (comma-separated): e.g. Bos_taurus, Vulpes_vulpes"
            value={bulkTags}
            onChange={e => setBulkTags(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyBulk()}
          />
          <select value={bulkOp} onChange={e => setBulkOp(e.target.value)}>
            <option value="1">➕ Add tags</option>
            <option value="0">➖ Remove tags</option>
          </select>
          <button className="mt-apply-btn" onClick={applyBulk} disabled={loading || !bulkTags.trim()}>
            {loading ? 'Applying…' : 'Apply'}
          </button>
        </div>
        <div className="mt-hint">
          {selected.length === 0
            ? '⚠️ No files selected — operation will apply to all files'
            : `✔ Applying to ${selected.length} selected file(s)`}
        </div>
      </div>

      {/* File list */}
      <div className="mt-list-header">
        <div className="mt-count">{files.length} file{files.length !== 1 ? 's' : ''}</div>
      </div>

      {filesLoading ? (
        <div className="mt-empty">Loading files…</div>
      ) : files.length === 0 ? (
        <div className="mt-empty">No files found. Upload some images or videos first.</div>
      ) : (
        files.map((f, i) => {
          const url = f.file_url || f.original_url
          const name = url?.split('/').pop() || 'file'
          const tags = f.tags ? Object.keys(f.tags) : []
          const isSelected = selected.includes(url)
          const thumbSrc = f.thumbnail_url?.startsWith('s3://')
            ? f.thumbnail_url.replace(
                `s3://${import.meta.env.VITE_MEDIA_BUCKET}/thumbnails/`,
                `https://storage.googleapis.com/${import.meta.env.VITE_GCP_BUCKET_NAME}/thumbnails/`
              )
            : f.thumbnail_url

          return (
            <div
              className={`mt-file-row ${isSelected ? 'selected' : ''}`}
              key={i}
              onClick={() => toggleSelect(url)}
              style={{ cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                className="mt-check"
                checked={isSelected}
                onChange={() => toggleSelect(url)}
                onClick={e => e.stopPropagation()}
              />

              <div className="mt-thumb">
                {thumbSrc
                  ? <img src={thumbSrc} alt={name} />
                  : <span style={{ fontSize: 22 }}>{f.file_type === 'video' ? '🎬' : '🖼️'}</span>
                }
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mt-filename">{name}</div>
                <div className="mt-meta">{f.file_type?.toUpperCase() || 'FILE'}</div>
                <div>
                  {tags.length > 0
                    ? tags.map(tag => <span key={tag} className="mt-tag">🏷 {tag}</span>)
                    : <span style={{ fontSize: 11, color: 'var(--eco-muted)' }}>No tags</span>
                  }
                </div>
              </div>

              <button
                className="mt-del-btn"
                onClick={e => { e.stopPropagation(); deleteFile(url, name) }}
                title="Delete file"
              >🗑</button>
            </div>
          )
        })
      )}
    </div>
  )
}