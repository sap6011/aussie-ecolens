import { useState } from 'react'

export default function Login({ onLogin, onSignup }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState('')
const [loading, setLoading] = useState(false)

async function handleSubmit(e) {
  e.preventDefault()
  setLoading(true)
  setError('')
  try {
    const { CognitoUserPool, CognitoUser, AuthenticationDetails } = await import('amazon-cognito-identity-js')
    
    const poolData = {
      UserPoolId: 'us-east-1_4xMmuVjWC',
      ClientId: '5uvau3vaf9vogduhc7rq00mva0'
    }
    const userPool = new CognitoUserPool(poolData)
    const authDetails = new AuthenticationDetails({ Username: email, Password: password })
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool })

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (result) => {
        const token = result.getIdToken().getJwtToken()
        localStorage.setItem('token', token)
        onLogin({ email })
        setLoading(false)
      },
      onFailure: (err) => {
        setError(err.message)
        setLoading(false)
      }
    })
  } catch (err) {
    setError(err.message)
    setLoading(false)
  }
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
          {error && <div className="alert alert-error">{error}</div>}
<button type="submit" className="btn-primary" disabled={loading}>
  {loading ? 'Signing in...' : 'Sign in'}
</button>
        </form>
        <div className="auth-switch">
          Don't have an account? <a onClick={onSignup}>Sign up</a>
        </div>
      </div>
    </div>
  )
}
