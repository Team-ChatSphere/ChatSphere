import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { token, signIn, registerAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ usernameOrEmail: '', password: '', email: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/dashboard" replace />;

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) {
        await registerAccount({ username: values.usernameOrEmail.trim(), email: values.email.trim(), password: values.password });
        navigate('/login', { replace: true, state: { registered: true } });
      } else {
        await signIn({ usernameOrEmail: values.usernameOrEmail.trim(), password: values.password });
        navigate('/dashboard', { replace: true });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <div className="brand-mark">C</div>
        <p className="eyebrow">CHATSPHERE</p>
        <h1>Good conversations<br />start here.</h1>
        <p className="intro-copy">A calmer space to catch up, share ideas, and stay close to your people.</p>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">YOUR SPACE, YOUR PEOPLE</p>
          <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
          <p className="muted">{isRegister ? 'Join the conversation in a few seconds.' : location.state?.registered ? 'Account created. Sign in to continue.' : 'Sign in to pick up where you left off.'}</p>
          <form onSubmit={submit}>
            {isRegister && (
              <label>Email address
                <input name="email" type="email" autoComplete="email" value={values.email} onChange={update} required />
              </label>
            )}
            <label>{isRegister ? 'Username' : 'Username or email'}
              <input name="usernameOrEmail" autoComplete={isRegister ? 'username' : 'username'} value={values.usernameOrEmail} onChange={update} minLength={isRegister ? 3 : undefined} required />
            </label>
            <label>Password
              <input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={values.password} onChange={update} minLength={isRegister ? 8 : undefined} required />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-wide" disabled={busy}>
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to ChatSphere?'}{' '}
            <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
