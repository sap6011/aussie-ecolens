import { useState } from 'react'

export default function Signup({ onSignup, onLogin }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [code, setCode] = useState('')
  const [cognitoUser, setCognitoUser] = useState(null)

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { CognitoUserPool, CognitoUserAttribute } = await import('amazon-cognito-identity-js')
      const userPool = new CognitoUserPool({
        UserPoolId: 'us-east-1_4xMmuVjWC',
        ClientId: '5uvau3vaf9vogduhc7rq00mva0'
      })
      const attributes = [
        new CognitoUserAttribute({ Name: 'given_name', Value: form.firstName }),
        new CognitoUserAttribute({ Name: 'family_name', Value: form.lastName }),
        new CognitoUserAttribute({ Name: 'email', Value: form.email }),
      ]
      userPool.signUp(form.email, form.password, attributes, null, (err, result) => {
        if (err) { setError(err.message); setLoading(false); return }
        setCognitoUser(result.user)
        setVerifying(true)
        setLoading(false)
      })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setLoading(true)
    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) { setError(err.message); setLoading(false); return }
      onSignup({ email: form.email })
      setLoading(false)
    })
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">🌿 EcoLens</div>
        <div className="auth-sub">{verifying ? 'Verify your email' : 'Create your account'}</div>

        {verifying ? (
          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label>Verification code (check your email)</label>
              <input type="text" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        ) : (
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
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create account'}
            </button>
          </form>
        )}
        <div className="auth-switch">
          Already have an account? <a onClick={onLogin}>Sign in</a>
        </div>
      </div>
    </div>
  )
}