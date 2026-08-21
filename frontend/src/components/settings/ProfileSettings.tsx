import { useAuthStore } from '@/stores/authStore'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function ProfileSettings() {
  const { profile, fetchProfile } = useAuthStore()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [status, setStatus] = useState(profile?.status ?? 'online')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string|null>(null)
  const [error, setError] = useState<string|null>(null)

  const handleSave = async () => {
    if (!profile) return
    setSaving(true); setError(null); setMsg(null)
    const { error } = await supabase.from('profiles').update({
      display_name: displayName || null,
      username: username.trim(),
      bio: bio || null,
      status,
    }).eq('id', profile.id)
    if (error) setError(error.message)
    else { setMsg('Profile updated'); await fetchProfile(profile.id) }
    setSaving(false)
  }

  if (!profile) return <div className="p-4 text-surface-400">Loading profile…</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Profile</h2>
        <p className="text-sm text-surface-400">Manage your public profile</p>
      </div>
      {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded p-2">{error}</div>}
      {msg && <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm rounded p-2">{msg}</div>}
      <div className="flex items-center gap-4 p-4 bg-surface-800 rounded-xl">
        <Avatar src={profile.avatar_url} fallback={profile.username} size={64} />
        <div>
          <div className="font-medium text-white">{profile.display_name || profile.username}</div>
          <div className="text-sm text-surface-400">@{profile.username}</div>
        </div>
      </div>
      <div className="grid gap-4">
        <div>
          <label className="text-sm text-surface-300">Username</label>
          <Input value={username} onChange={e=> setUsername(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-surface-300">Display Name</label>
          <Input value={displayName} onChange={e=> setDisplayName(e.target.value)} placeholder="Display name" />
        </div>
        <div>
          <label className="text-sm text-surface-300">Bio</label>
          <Textarea value={bio} onChange={e=> setBio(e.target.value)} placeholder="Tell us about yourself" rows={3} maxLength={300} />
        </div>
        <div>
          <label className="text-sm text-surface-300">Status</label>
          <div className="flex gap-2 mt-1">
            {(['online','idle','dnd','offline'] as const).map(s=>(
              <button key={s} onClick={()=> setStatus(s)} className={`px-3 py-1.5 rounded-full text-sm capitalize border ${status===s ? 'bg-akay-600 border-akay-500 text-white' : 'bg-surface-800 border-surface-700 text-surface-300'}`}>{s}</button>
            ))}
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-fit">{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </div>
  )
}
