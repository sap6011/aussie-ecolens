import { useState } from 'react'

export default function Signup({ onSignup, onLogin }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirm: '' })

  function handleSubmit(e) {
    e.preventDefault()
    onSignup({ email: form.email || 'user@example.com' })
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">🌿 EcoLens</div>
        <div className="auth-sub">Create your account</div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>First name</label>
              <input type="text" placeholder="Jane" value={form.firstName} onChange={set('firstName')} />
            </div>
            <div className="form-group">
              <label>Last name</label>
              <input type="text" placeholder="Doe" value={form.lastName} onChange={set('lastName')} />
            </div>
          </div>
          <div className="form-group">
            <label>Email address</label>
            <input type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={form.password} onChange={set('password')} />
          </div>
          <div className="form-group">
            <label>Confirm password</label>
            <input type="password" placeholder="••••••••" value={form.confirm} onChange={set('confirm')} />
          </div>
          <button type="submit" className="btn-primary">Create account</button>
        </form>
        <div className="auth-switch">
          Already have an account? <a onClick={onLogin}>Sign in</a>
        </div>
      </div>
    </div>
  )
}
