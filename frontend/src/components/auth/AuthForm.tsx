import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const nav = useNavigate()

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else nav('/')
    setLoading(false)
  }

  const handleDevLogin = () => {
    // Rate-limit bypass: local dev login without Supabase email (uses dev: userId for signaling)
    // Use proper UUID so Supabase queries don't fail with "invalid input syntax for type uuid"
    const devId = (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? (globalThis.crypto as any).randomUUID() : '00000000-0000-4000-a000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')
    const short = devId.slice(0, 8)
    const devUser: any = { id: devId, email: `${devId}@dev.local` }
    const devProfile: any = {
      id: devId,
      username: 'dev_' + short,
      display_name: 'Dev ' + short,
      avatar_url: null,
      status: 'online',
      bio: 'Local dev (email limit bypass) — voice only, chat/servers require real login',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    // create a fake session so Supabase client thinks we're logged in (no JWT needed for dev-bypass)
    // we store dev token in localStorage for SignalingClient fallback
    try { localStorage.setItem('akay_dev_token', `dev:${devId}`); localStorage.setItem('akay_dev_profile', JSON.stringify(devProfile)) } catch {}
    useAuthStore.getState().setUser(devUser)
    useAuthStore.getState().setProfile(devProfile)
    useAuthStore.getState().setSession({ user: devUser } as any)
    nav('/')
  }

  return (
    <form onSubmit={handle} className="space-y-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold text-white">Welcome back</h1>
      <p className="text-sm text-surface-400">Sign in to continue to Akayroom</p>
      {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-lg p-3">{error}</div>}
      {error && String(error).toLowerCase().includes('rate limit') && (
        <div className="bg-amber-950/50 border border-amber-800 text-amber-300 text-sm rounded-lg p-3">
          Email rate limit — 1 saat beklemek yerine <b>Dev Giriş</b> ile local test yapabilirsin.
        </div>
      )}
      <div>
        <label className="text-sm text-surface-300">Email</label>
        <Input type="email" required value={email} onChange={e=> setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div>
        <label className="text-sm text-surface-300">Password</label>
        <Input type="password" required value={password} onChange={e=> setPassword(e.target.value)} placeholder="••••••••" />
      </div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? 'Signing in…' : 'Sign In'}</Button>
      <Button type="button" variant="secondary" onClick={handleDevLogin} className="w-full">Dev Giriş (Rate Limit Bypass)</Button>
      <div className="text-sm text-surface-400 text-center">
        No account? <Link to="/register" className="text-akay-400 hover:underline">Register</Link> • <Link to="/reset" className="text-akay-400 hover:underline">Forgot password?</Link>
      </div>
    </form>
  )
}

export function RegisterForm() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [success, setSuccess] = useState(false)
  const nav = useNavigate()

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    if (username.length < 3) { setError('Username must be at least 3 chars'); setLoading(false); return }
    if (!/^[a-zA-Z0-9_.]+$/.test(username)) { setError('Username only letters, numbers, _ .'); setLoading(false); return }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username, display_name: displayName || username } }
    })
    if (error) setError(error.message)
    else if (data.user) {
      // auto sign in handled via session; profile will be created via trigger
      setSuccess(true)
      setTimeout(()=> nav('/'), 1500)
    }
    setLoading(false)
  }

  if (success) return <div className="text-center py-8"><div className="text-emerald-400 font-medium">Account created! Redirecting…</div><div className="text-sm text-surface-400 mt-2">Check your email to confirm if required.</div></div>

  return (
    <form onSubmit={handle} className="space-y-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold text-white">Create account</h1>
      <p className="text-sm text-surface-400">Join Akayroom — modern communication</p>
      {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-lg p-3">{error}</div>}
      <div>
        <label className="text-sm text-surface-300">Username *</label>
        <Input required value={username} onChange={e=> setUsername(e.target.value)} placeholder="akay_user" minLength={3} maxLength={32} />
        <div className="text-xs text-surface-500 mt-1">3-32 chars, letters numbers _ .</div>
      </div>
      <div>
        <label className="text-sm text-surface-300">Display Name</label>
        <Input value={displayName} onChange={e=> setDisplayName(e.target.value)} placeholder="Akay" maxLength={32} />
      </div>
      <div>
        <label className="text-sm text-surface-300">Email *</label>
        <Input type="email" required value={email} onChange={e=> setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div>
        <label className="text-sm text-surface-300">Password *</label>
        <Input type="password" required value={password} onChange={e=> setPassword(e.target.value)} placeholder="••••••••" minLength={6} />
      </div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? 'Creating…' : 'Create Account'}</Button>
      <div className="text-sm text-surface-400 text-center">
        Have account? <Link to="/login" className="text-akay-400 hover:underline">Sign in</Link>
      </div>
    </form>
  )
}

export function ResetForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string|null>(null)
  const [error, setError] = useState<string|null>(null)
  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null); setMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset' })
    if (error) setError(error.message)
    else setMsg('Check your email for reset link')
    setLoading(false)
  }
  return (
    <form onSubmit={handle} className="space-y-4 w-full max-w-sm">
      <h1 className="text-xl font-bold text-white">Reset password</h1>
      {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-lg p-3">{error}</div>}
      {msg && <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm rounded-lg p-3">{msg}</div>}
      <div>
        <label className="text-sm text-surface-300">Email</label>
        <Input type="email" required value={email} onChange={e=> setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? 'Sending…' : 'Send reset link'}</Button>
      <div className="text-sm text-center"><Link to="/login" className="text-akay-400 hover:underline">Back to login</Link></div>
    </form>
  )
}
