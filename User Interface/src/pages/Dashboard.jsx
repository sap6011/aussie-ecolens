const SAMPLE_FILES = [
  { name: 'DSC_0412.jpg', emoji: '🦘', type: 'IMAGE', tags: 'kangaroo, eucalyptus' },
  { name: 'clip_0031.mp4', emoji: '🦜', type: 'VIDEO', tags: 'cockatoo, kookaburra' },
  { name: 'koala_tree.jpg', emoji: '🐨', type: 'IMAGE', tags: 'koala' },
  { name: 'dingo_sunset.jpg', emoji: '🦊', type: 'IMAGE', tags: 'dingo' },
]

export default function Dashboard({ onUpload }) {
  return (
    <div>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">Your wildlife observation summary</div>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Files</div>
          <div className="stat-value">142</div>
          <div className="stat-meta">↑ 12 this week</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Species Tagged</div>
          <div className="stat-value">38</div>
          <div className="stat-meta">Across all files</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Images</div>
          <div className="stat-value">118</div>
          <div className="stat-meta">Auto-tagged</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Videos</div>
          <div className="stat-value">24</div>
          <div className="stat-meta">Frame-analysed</div>
        </div>
      </div>

      <div className="section-title">
        Recent uploads
        <a onClick={onUpload}>Upload new →</a>
      </div>
      <div className="file-grid">
        {SAMPLE_FILES.map(f => (
          <div className="file-card" key={f.name}>
            <div className={`file-thumb ${f.type === 'VIDEO' ? 'video' : ''}`}>
              {f.emoji}
              <span className="file-badge">{f.type}</span>
            </div>
            <div className="file-info">
              <div className="file-name">{f.name}</div>
              <div className="file-tags">{f.tags}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
