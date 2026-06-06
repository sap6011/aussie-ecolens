import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL

const KNOWN_SPECIES = [
  'Alectura_lathami', 'Bos_taurus', 'Canis_dingo', 'Casuarius_casuarius',
  'Dacelo_novaeguineae', 'Felis_catus', 'Gymnorhina_tibicen', 'Macropus_giganteus',
  'Trichosurus_vulpecula', 'Varanus_varius', 'Vombatus_ursinus', 'Vulpes_vulpes',
  'Wallabia_bicolor', 'Sus_scrofa', 'Rattus',
]

export default function Notifications() {
  const [email, setEmail]       = useState('')
  const [tagInput, setTagInput] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [alert, setAlert]       = useState('')

  function addTag() {
    const t = tagInput.trim()
    if (t && !selectedTags.includes(t)) {
      setSelectedTags(s => [...s, t])
    }
    setTagInput('')
  }

  function removeTag(tag) {
    setSelectedTags(s => s.filter(t => t !== tag))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
  }

  async function handleSubscribe() {
    if (!email) {
      setAlert('Please enter your email address.')
      setTimeout(() => setAlert(''), 3000)
      return
    }
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/subscribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tags: selectedTags })
      })
      if (!res.ok) throw new Error('Subscription failed')
      setSubmitted(true)
      const tagMsg = selectedTags.length > 0
        ? ` for: ${selectedTags.join(', ')}`
        : ' for all species'
      setAlert(`✅ Confirmation email sent to ${email}${tagMsg}. Please check your inbox and confirm.`)
    } catch (err) {
      setAlert(`❌ ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Notifications</div>
        <div className="page-subtitle">Get email alerts when specific wildlife is detected in new uploads</div>
      </div>

      <div className="alert alert-info">
        ℹ️ Notifications are sent via AWS SNS. You will receive a confirmation email please click the link to activate.
      </div>

      {alert && <div className="alert alert-success">{alert}</div>}

      <div className="notif-card">
        <div className="notif-card-title">Your email</div>
        <div className="bulk-row">
          <input
            placeholder="Enter your email to receive notifications"
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            disabled={submitted}
          />
        </div>
      </div>

      <div className="notif-card">
        <div className="notif-card-title">
          Filter by species&nbsp;
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--eco-muted)' }}>
            (optional, leave empty to receive alerts for all species)
          </span>
        </div>

        {/* Quick-select chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {KNOWN_SPECIES.map(sp => (
            <span
              key={sp}
              onClick={() => !submitted && !selectedTags.includes(sp) && setSelectedTags(s => [...s, sp])}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                cursor: submitted ? 'default' : 'pointer',
                background: selectedTags.includes(sp) ? 'var(--eco-primary)' : 'var(--eco-surface)',
                color: selectedTags.includes(sp) ? '#fff' : 'var(--eco-text)',
                border: '1px solid var(--eco-border)',
                transition: 'background 0.15s',
              }}
            >
              {sp.replace('_', ' ')}
            </span>
          ))}
        </div>

        {/* Custom species input */}
        <div className="bulk-row" style={{ marginBottom: 8 }}>
          <input
            placeholder="Or type a species name and press Enter"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitted}
          />
          <button className="btn-add" onClick={addTag} disabled={submitted || !tagInput.trim()}>
            Add
          </button>
        </div>

        {/* Selected tags */}
        {selectedTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {selectedTags.map(tag => (
              <span key={tag} className="tag-pill" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {tag}
                {!submitted && (
                  <span
                    onClick={() => removeTag(tag)}
                    style={{ cursor: 'pointer', fontWeight: 700, marginLeft: 2 }}
                  >×</span>
                )}
              </span>
            ))}
          </div>
        )}

        {selectedTags.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--eco-muted)', marginTop: 4 }}>
            No filter applied. You will receive alerts for every species detected.
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="btn-add" onClick={handleSubscribe} disabled={loading || submitted}>
          {loading ? 'Subscribing...' : submitted ? 'Subscribed ✓' : 'Subscribe'}
        </button>
      </div>

      <div className="notif-card" style={{ marginTop: 16 }}>
        <div className="notif-card-title">What triggers a notification?</div>
        <div className="notif-row">
          <div className="notif-info">
            <div className="notif-title">🐾 New wildlife detected</div>
            <div className="notif-desc">
              When a new image or video is uploaded and species are detected, you will receive an
              email if any detected species matches your filter. If no filter is set, you receive
              notifications for every upload.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}