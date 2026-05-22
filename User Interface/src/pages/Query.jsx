import { useState, useRef } from 'react'

const SAMPLE_RESULTS = [
  { name: 'DSC_0412.jpg', emoji: '🦘', tags: ['kangaroo', 'eucalyptus'] },
  { name: 'koala_tree.jpg', emoji: '🐨', tags: ['koala'] },
  { name: 'dingo_sunset.jpg', emoji: '🦊', tags: ['dingo'] },
]

const TABS = [
  { id: 'species', label: 'By species' },
  { id: 'tags', label: 'By tag count' },
  { id: 'url', label: 'By thumbnail URL' },
  { id: 'file', label: 'By file content' },
]

export default function Query() {
  const [activeTab, setActiveTab] = useState('species')
  const [results, setResults] = useState(SAMPLE_RESULTS)
  const [inputs, setInputs] = useState({ species: '', tags: '', url: '', file: '' })
  const fileRef = useRef()

  function setInput(key, val) {
    setInputs(i => ({ ...i, [key]: val }))
  }

  function runQuery() {
    setResults(SAMPLE_RESULTS)
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
              <button className="btn-search" onClick={runQuery}>🔍 Search</button>
            </div>
          </>
        )}

        {activeTab === 'tags' && (
          <>
            <div className="query-hint">Specify species with minimum counts (AND logic). e.g. <code>koala:3, wombat:2</code></div>
            <div className="query-row">
              <input className="query-input" placeholder="koala:3, wombat:2" value={inputs.tags} onChange={e => setInput('tags', e.target.value)} />
              <button className="btn-search" onClick={runQuery}>🔍 Search</button>
            </div>
          </>
        )}

        {activeTab === 'url' && (
          <>
            <div className="query-hint">Paste a thumbnail URL to find the full-size image</div>
            <div className="query-row">
              <input className="query-input" placeholder="https://storage.../thumbs/koala_thumb.jpg" value={inputs.url} onChange={e => setInput('url', e.target.value)} />
              <button className="btn-search" onClick={runQuery}>🔍 Search</button>
            </div>
          </>
        )}

        {activeTab === 'file' && (
          <>
            <div className="query-hint">Upload a file — EcoLens detects its species and finds all matching files</div>
            <div className="query-row">
              <input className="query-input" placeholder="Click to select a file..." value={inputs.file} readOnly onClick={() => fileRef.current.click()} style={{ cursor: 'pointer' }} />
              <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => setInput('file', e.target.files[0]?.name || '')} />
              <button className="btn-search" onClick={runQuery}>🔍 Search</button>
            </div>
          </>
        )}
      </div>

      <div className="section-title">Results ({results.length} found)</div>
      <div className="results-grid">
        {results.map(r => (
          <div className="result-card" key={r.name}>
            <div className="result-img">{r.emoji}</div>
            <div className="result-body">
              <div className="result-name">{r.name}</div>
              <div>{r.tags.map(t => <span key={t} className="tag-pill">{t}</span>)}</div>
              <div className="result-actions">
                <button className="btn-sm">⛶ Full size</button>
                <button className="btn-danger">🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
