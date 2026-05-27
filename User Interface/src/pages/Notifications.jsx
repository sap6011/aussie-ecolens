import { useState } from 'react'

const API = 'https://1gwype1nc4.execute-api.us-east-1.amazonaws.com/prod'

const EMOJI_MAP = { koala:'🐨', kangaroo:'🦘', wombat:'🦡', dingo:'🦊', platypus:'🦆', echidna:'🦔', cockatoo:'🦜', kookaburra:'🐦', magpie:'🐦', possum:'🐭' }

export default function Notifications() {
  const [species, setSpecies] = useState([])
  const [newSpecies, setNewSpecies] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState('')

  async function subscribe(speciesName) {
    if (!email) {
      setAlert('Please enter your email first!')
      setTimeout(() => setAlert(''), 3000)
      return
    }
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API}/notify`, {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, species: speciesName })
      })
      if (!res.ok) throw new Error('Failed to subscribe')
      setAlert(`✅ Subscribed to notifications for ${speciesName}!`)
      setTimeout(() => setAlert(''), 3000)
    } catch (err) {
      setAlert(err.message)
    } finally {
      setLoading(false)
    }
  }

  function addSpecies() {
    const name = newSpecies.trim()
    if (!name) return
    const emoji = EMOJI_MAP[name.toLowerCase()] || '🐾'
    setSpecies(s => [...s, { id: Date.now(), name: name.charAt(0).toUpperCase() + name.slice(1), emoji }])
    setNewSpecies('')
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Notifications</div>
        <div className="page-subtitle">Get email alerts when new files match your watched species</div>
      </div>

      <div className="alert alert-info">
        ℹ️ Notifications are sent via AWS SNS to your registered email address.
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
          />
        </div>
      </div>

      <div className="notif-card">
        <div className="notif-card-title">Watched species</div>
        {species.map(s => (
          <div className="notif-row" key={s.id}>
            <div className="notif-info">
              <div className="notif-title">{s.emoji} {s.name}</div>
              <div className="notif-desc">Notify when new {s.name.toLowerCase()} files are uploaded</div>
            </div>
            <button className="btn-add" onClick={() => subscribe(s.name)} disabled={loading}>
              Subscribe
            </button>
          </div>
        ))}
        <div className="add-notif">
          <input
            className="species-input"
            placeholder="Add species to watch (e.g. wombat)"
            value={newSpecies}
            onChange={e => setNewSpecies(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSpecies()}
          />
          <button className="btn-add" onClick={addSpecies}>+ Add</button>
        </div>
      </div>
    </div>
  )
}