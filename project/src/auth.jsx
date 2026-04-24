// Authentication screens: Login, Register, ForgotPassword, ResetPassword

function AuthShell({ theme, children, title, subtitle }) {
  return (
    <div style={{
      minHeight: '100vh', background: theme.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: theme.text, display: 'grid', placeItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M1 10 L4 6 L7 8 L11 2" stroke={theme.bg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: theme.text, letterSpacing: '-0.02em' }}>Burnup</span>
        </div>

        <div style={{
          background: theme.surface, border: `1px solid ${theme.border}`,
          borderRadius: 14, padding: 28,
          boxShadow: theme.dark ? '0 20px 60px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, letterSpacing: '-0.02em', marginBottom: 4 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: theme.textMuted }}>{subtitle}</div>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function AuthField({ theme, label, type = 'text', value, onChange, placeholder, autoFocus }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted, marginBottom: 6 }}>{label}</div>
      <window.Input theme={theme} type={type} value={value} onChange={onChange}
        placeholder={placeholder} autoFocus={autoFocus} />
    </div>
  );
}

function AuthError({ theme, msg }) {
  if (!msg) return null;
  return (
    <div style={{
      fontSize: 12.5, color: theme.danger, marginBottom: 14, padding: '9px 12px',
      borderRadius: 7, background: `color-mix(in oklch, ${theme.danger} 10%, transparent)`,
      border: `1px solid color-mix(in oklch, ${theme.danger} 20%, transparent)`,
    }}>{msg}</div>
  );
}

// ── Login ──────────────────────────────────────────────────────────────────

function LoginForm({ theme, onSuccess, onGoRegister, onGoForgot }) {
  const [email,    setEmail]    = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error,    setError]    = React.useState(null);
  const [loading,  setLoading]  = React.useState(false);

  const handle = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await window.api.login(email, password);
      localStorage.setItem('burnup.token', res.token);
      onSuccess(res);
    } catch (err) {
      setError(err.message.includes('401') ? 'Invalid email or password.' : err.message);
    } finally { setLoading(false); }
  };

  return (
    <AuthShell theme={theme} title="Sign in" subtitle="Welcome back">
      <form onSubmit={handle}>
        <AuthField theme={theme} label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
        <AuthField theme={theme} label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        <AuthError theme={theme} msg={error} />
        <window.Button theme={theme} variant="primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </window.Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
          <button type="button" onClick={onGoForgot} style={{ border: 'none', background: 'transparent', color: theme.accent, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12.5 }}>
            Forgot password?
          </button>
          <button type="button" onClick={onGoRegister} style={{ border: 'none', background: 'transparent', color: theme.accent, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12.5 }}>
            Create account
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

// ── Register ───────────────────────────────────────────────────────────────

function RegisterForm({ theme, onSuccess, onGoLogin, inviteToken }) {
  const [email,    setEmail]    = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm,  setConfirm]  = React.useState('');
  const [token,    setToken]    = React.useState(inviteToken || '');
  const [error,    setError]    = React.useState(null);
  const [loading,  setLoading]  = React.useState(false);
  const [inviteOnly, setInviteOnly] = React.useState(false);

  // Check if registration is invite-only
  React.useEffect(() => {
    // Try a probe login to detect 403 on registration (invite-only)
    // We can't know without an API endpoint, so we'll discover it on submit
  }, []);

  const handle = async (e) => {
    e.preventDefault();
    if (!email || !password)          { setError('All fields are required.'); return; }
    if (password !== confirm)         { setError('Passwords do not match.'); return; }
    if (password.length < 8)          { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await window.api.register(email, password, token || null);
      localStorage.setItem('burnup.token', res.token);
      onSuccess(res);
    } catch (err) {
      if (err.message.includes('403')) {
        setInviteOnly(true);
        setError('Registration is invite-only. Please enter your invite token.');
      } else if (err.message.includes('409')) {
        setError('An account with that email already exists.');
      } else {
        setError(err.message);
      }
    } finally { setLoading(false); }
  };

  return (
    <AuthShell theme={theme} title="Create account" subtitle="Get started with Burnup">
      <form onSubmit={handle}>
        <AuthField theme={theme} label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
        <AuthField theme={theme} label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
        <AuthField theme={theme} label="Confirm password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" />
        {(inviteOnly || inviteToken) && (
          <AuthField theme={theme} label="Invite token" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste invite token" />
        )}
        <AuthError theme={theme} msg={error} />
        <window.Button theme={theme} variant="primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </window.Button>
        <div style={{ textAlign: 'center', fontSize: 12.5 }}>
          <button type="button" onClick={onGoLogin} style={{ border: 'none', background: 'transparent', color: theme.accent, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12.5 }}>
            Already have an account? Sign in
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

// ── Forgot password ────────────────────────────────────────────────────────

function ForgotPasswordForm({ theme, onGoLogin }) {
  const [email,   setEmail]   = React.useState('');
  const [error,   setError]   = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [sent,    setSent]    = React.useState(false);
  const [devLink, setDevLink] = React.useState(null);

  const handle = async (e) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email address.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await window.api.forgotPassword(email);
      if (res?.dev && res?.resetLink) setDevLink(res.resetLink);
      setSent(true);
    } catch (err) {
      // 204 No Content arrives as null (success, even if email not found)
      if (err.message.includes('204') || err.message.includes('null')) { setSent(true); return; }
      setError(err.message);
    } finally { setLoading(false); }
  };

  if (sent) return (
    <AuthShell theme={theme} title="Check your email" subtitle="A reset link has been sent if that account exists.">
      {devLink && (
        <div style={{
          fontSize: 12, padding: '10px 12px', borderRadius: 7, marginBottom: 16,
          background: `color-mix(in oklch, ${theme.accent} 10%, transparent)`,
          border: `1px solid color-mix(in oklch, ${theme.accent} 25%, transparent)`,
          wordBreak: 'break-all', color: theme.text,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: theme.textMuted }}>DEV MODE — no SMTP configured</div>
          <a href={devLink} style={{ color: theme.accent }}>{devLink}</a>
        </div>
      )}
      <window.Button theme={theme} variant="ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={onGoLogin}>
        Back to sign in
      </window.Button>
    </AuthShell>
  );

  return (
    <AuthShell theme={theme} title="Reset password" subtitle="Enter your email and we'll send a reset link.">
      <form onSubmit={handle}>
        <AuthField theme={theme} label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
        <AuthError theme={theme} msg={error} />
        <window.Button theme={theme} variant="primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </window.Button>
        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={onGoLogin} style={{ border: 'none', background: 'transparent', color: theme.accent, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12.5 }}>
            Back to sign in
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

// ── Reset password ─────────────────────────────────────────────────────────

function ResetPasswordForm({ theme, resetToken, onSuccess, onGoLogin }) {
  const [password, setPassword] = React.useState('');
  const [confirm,  setConfirm]  = React.useState('');
  const [error,    setError]    = React.useState(null);
  const [loading,  setLoading]  = React.useState(false);

  const handle = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await window.api.resetPassword(resetToken, password);
      localStorage.setItem('burnup.token', res.token);
      onSuccess(res);
    } catch (err) {
      setError(err.message.includes('400') ? 'This reset link is invalid or has expired.' : err.message);
    } finally { setLoading(false); }
  };

  return (
    <AuthShell theme={theme} title="Set new password" subtitle="Choose a new password for your account.">
      <form onSubmit={handle}>
        <AuthField theme={theme} label="New password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoFocus />
        <AuthField theme={theme} label="Confirm new password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" />
        <AuthError theme={theme} msg={error} />
        <window.Button theme={theme} variant="primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} disabled={loading}>
          {loading ? 'Saving…' : 'Set new password'}
        </window.Button>
        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={onGoLogin} style={{ border: 'none', background: 'transparent', color: theme.accent, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12.5 }}>
            Back to sign in
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

// ── Auth router — picks the right screen based on `authView` ───────────────

function AuthRouter({ theme, authView, setAuthView, onLogin, inviteToken, resetToken }) {
  if (authView === 'register')
    return <RegisterForm theme={theme} inviteToken={inviteToken}
      onSuccess={onLogin} onGoLogin={() => setAuthView('login')} />;
  if (authView === 'forgot')
    return <ForgotPasswordForm theme={theme} onGoLogin={() => setAuthView('login')} />;
  if (authView === 'reset' && resetToken)
    return <ResetPasswordForm theme={theme} resetToken={resetToken}
      onSuccess={onLogin} onGoLogin={() => setAuthView('login')} />;

  return <LoginForm theme={theme} onSuccess={onLogin}
    onGoRegister={() => setAuthView('register')}
    onGoForgot={() => setAuthView('forgot')} />;
}

Object.assign(window, { AuthRouter });
