import { useState } from 'react'

export default function Login({ onLogin, onSignup }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    onLogin({ email: email || 'user@example.com' })
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">🌿 EcoLens</div>
        <div className="auth-sub">Australian Wildlife Observation Platform</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary">Sign in</button>
        </form>
        <div className="auth-switch">
          Don't have an account? <a onClick={onSignup}>Sign up</a>
        </div>
      </div>
    </div>
  )
}
