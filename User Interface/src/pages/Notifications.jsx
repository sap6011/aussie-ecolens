import { useState } from 'react'

const INITIAL_SPECIES = [
  { id: 1, name: 'Koala', emoji: '🐨', enabled: true },
  { id: 2, name: 'Kangaroo', emoji: '🦘', enabled: true },
  { id: 3, name: 'Dingo', emoji: '🦊', enabled: false },
]

const EMOJI_MAP = { koala:'🐨', kangaroo:'🦘', wombat:'🦡', dingo:'🦊', platypus:'🦆', echidna:'🦔', cockatoo:'🦜', kookaburra:'🐦', magpie:'🐦', possum:'🐭' }

export default function Notifications() {
  const [species, setSpecies] = useState(INITIAL_SPECIES)
  const [prefs, setPrefs] = useState({ digest: false, tagUpdates: true })
  const [newSpecies, setNewSpecies] = useState('')

  function toggleSpecies(id) {
    setSpecies(s => s.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  }

  function togglePref(key) {
    setPrefs(p => ({ ...p, [key]: !p[key] }))
  }

  function addSpecies() {
    const name = newSpecies.trim()
    if (!name) return
    const emoji = EMOJI_MAP[name.toLowerCase()] || '🐾'
    setSpecies(s => [...s, { id: Date.now(), name: name.charAt(0).toUpperCase() + name.slice(1), emoji, enabled: true }])
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

      <div className="notif-card">
        <div className="notif-card-title">Watched species</div>
        {species.map(s => (
          <div className="notif-row" key={s.id}>
            <div className="notif-info">
              <div className="notif-title">{s.emoji} {s.name}</div>
              <div className="notif-desc">Notify when new {s.name.toLowerCase()} files are uploaded</div>
            </div>
            <button className={`toggle ${s.enabled ? 'on' : ''}`} onClick={() => toggleSpecies(s.id)} aria-label="toggle" />
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

      <div className="notif-card">
        <div className="notif-card-title">Notification preferences</div>
        <div className="notif-row">
          <div className="notif-info">
            <div className="notif-title">Email digest</div>
            <div className="notif-desc">Receive a daily summary instead of instant alerts</div>
          </div>
          <button className={`toggle ${prefs.digest ? 'on' : ''}`} onClick={() => togglePref('digest')} aria-label="toggle" />
        </div>
        <div className="notif-row">
          <div className="notif-info">
            <div className="notif-title">Tag updates</div>
            <div className="notif-desc">Notify when tags are manually changed on your files</div>
          </div>
          <button className={`toggle ${prefs.tagUpdates ? 'on' : ''}`} onClick={() => togglePref('tagUpdates')} aria-label="toggle" />
        </div>
      </div>
    </div>
  )
}
