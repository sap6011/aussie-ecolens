import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL

const EMOJI_MAP = { koala:'🐨', kangaroo:'🦘', wombat:'🦡', dingo:'🦊', platypus:'🦆', echidna:'🦔', cockatoo:'🦜', kookaburra:'🐦', magpie:'🐦', possum:'🐭' }

export default function Notifications() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState('')

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
        body: JSON.stringify({ email })
      })
      if (!res.ok) throw new Error('Subscription failed')
      setSubmitted(true)
      setAlert(`✅ Confirmation email sent to ${email}. Please check your inbox and confirm.`)
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
        <div className="page-subtitle">Get email alerts when wildlife is detected in new uploads</div>
      </div>

      <div className="alert alert-info">
        ℹ️ Notifications are sent via AWS SNS. You will receive a confirmation email — please click the link to activate.
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
          <button className="btn-add" onClick={handleSubscribe} disabled={loading || submitted}>
            {loading ? 'Subscribing...' : submitted ? 'Subscribed ✓' : 'Subscribe'}
          </button>
        </div>
      </div>

      <div className="notif-card">
        <div className="notif-card-title">What triggers a notification?</div>
        <div className="notif-row">
          <div className="notif-info">
            <div className="notif-title">🐾 New wildlife detected</div>
            <div className="notif-desc">Every time a new image or video is uploaded and species are detected, you will receive an email with the detected species and file details.</div>
          </div>
        </div>
      </div>
    </div>
  )
}