import { useState } from 'react'

const INITIAL_FILES = [
  { id: 1, name: 'DSC_0412.jpg', emoji: '🦘', type: 'image', tags: ['kangaroo', 'eucalyptus'] },
  { id: 2, name: 'koala_tree.jpg', emoji: '🐨', type: 'image', tags: ['koala'] },
  { id: 3, name: 'clip_0031.mp4', emoji: '🦜', type: 'video', tags: ['cockatoo', 'kookaburra'] },
]

export default function ManageTags() {
  const [files, setFiles] = useState(INITIAL_FILES)
  const [selected, setSelected] = useState([])
  const [bulkTags, setBulkTags] = useState('')
  const [bulkOp, setBulkOp] = useState('1')
  const [alert, setAlert] = useState('')

  function toggleSelect(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function removeTag(fileId, tag) {
    setFiles(fs => fs.map(f => f.id === fileId ? { ...f, tags: f.tags.filter(t => t !== tag) } : f))
  }

  function deleteFile(id) {
    setFiles(fs => fs.filter(f => f.id !== id))
    setSelected(s => s.filter(x => x !== id))
  }

  function applyBulk() {
    if (!bulkTags.trim()) return
    const tags = bulkTags.split(',').map(t => t.trim()).filter(Boolean)
    const targetIds = selected.length > 0 ? selected : files.map(f => f.id)
    setFiles(fs => fs.map(f => {
      if (!targetIds.includes(f.id)) return f
      if (bulkOp === '1') {
        return { ...f, tags: [...new Set([...f.tags, ...tags])] }
      } else {
        return { ...f, tags: f.tags.filter(t => !tags.includes(t)) }
      }
    }))
    setAlert(`${bulkOp === '1' ? 'Added' : 'Removed'} tags: ${tags.join(', ')}`)
    setBulkTags('')
    setTimeout(() => setAlert(''), 3000)
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
          <button className="btn-add" onClick={applyBulk}>Apply</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--eco-muted)', marginTop: 6 }}>
          {selected.length === 0 ? 'No files selected — operation will apply to all files' : `Applying to ${selected.length} selected file(s)`}
        </div>
      </div>

      {files.map(f => (
        <div className="file-list-item" key={f.id}>
          <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggleSelect(f.id)} />
          <div className={`file-list-thumb ${f.type === 'video' ? 'video' : ''}`}>{f.emoji}</div>
          <div className="file-list-info">
            <div className="file-list-name">{f.name}</div>
            <div className="file-list-tags">
              {f.tags.map(tag => (
                <span key={tag} className={`tag-pill ${f.type === 'video' ? 'video' : ''}`}>
                  {tag}
                  <button onClick={() => removeTag(f.id, tag)}>✕</button>
                </span>
              ))}
              {f.tags.length === 0 && <span style={{ fontSize: 11, color: 'var(--eco-muted)' }}>No tags</span>}
            </div>
          </div>
          <button className="btn-danger" onClick={() => deleteFile(f.id)}>🗑</button>
        </div>
      ))}

      {files.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--eco-muted)', fontSize: 13 }}>
          No files found.
        </div>
      )}
    </div>
  )
}
