import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/input'
import { useServerStore } from '@/stores/serverStore'

export function CreateServerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const { createServer } = useServerStore()
  if (!open) return null
  const handle = async () => {
    if (!name.trim() || name.trim().length < 2) { setError('Name must be at least 2 chars'); return }
    setLoading(true); setError(null)
    const res = await createServer(name.trim(), desc.trim() || undefined)
    setLoading(false)
    if (res) { setName(''); setDesc(''); onClose() }
    else setError('Failed to create server')
  }
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={e=> e.stopPropagation()} className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Create Server</h2>
        <p className="text-sm text-surface-400 mb-4">Your server is where you and your friends hang out. Create something new!</p>
        {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded p-2 mb-3">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-sm text-surface-300">Server Name *</label>
            <Input value={name} onChange={e=> setName(e.target.value)} placeholder="Akay's Server" maxLength={100} autoFocus />
          </div>
          <div>
            <label className="text-sm text-surface-300">Description</label>
            <Textarea value={desc} onChange={e=> setDesc(e.target.value)} placeholder="A place for friends..." maxLength={500} rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handle} disabled={loading || !name.trim()}>{loading ? 'Creating…' : 'Create'}</Button>
        </div>
      </div>
    </div>
  )
}

export function JoinServerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const { joinServer } = useServerStore()
  if (!open) return null
  const handle = async () => {
    if (!code.trim()) { setError('Enter invite code'); return }
    setLoading(true); setError(null)
    const ok = await joinServer(code.trim())
    setLoading(false)
    if (ok) { setCode(''); onClose() }
    else setError('Invalid invite code or already joined')
  }
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={e=> e.stopPropagation()} className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Join Server</h2>
        <p className="text-sm text-surface-400 mb-4">Enter an invite code to join an existing server.</p>
        {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded p-2 mb-3">{error}</div>}
        <div>
          <label className="text-sm text-surface-300">Invite Code</label>
          <Input value={code} onChange={e=> setCode(e.target.value)} placeholder="a1b2c3d4" autoFocus />
          <div className="text-xs text-surface-500 mt-1">You can find invite code in server settings</div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handle} disabled={loading || !code.trim()}>{loading ? 'Joining…' : 'Join Server'}</Button>
        </div>
      </div>
    </div>
  )
}

export function CreateChannelModal({ open, onClose, serverId }: { open: boolean; onClose: ()=>void; serverId: string|null }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'text'|'voice'>('text')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const { createChannel } = useServerStore()
  if (!open || !serverId) return null
  const handle = async () => {
    if (!name.trim()) { setError('Name required'); return }
    if (!/^[a-z0-9-_]+$/.test(name.toLowerCase().replace(/\s+/g,'-'))) { /* allow spaces but convert */ }
    setLoading(true); setError(null)
    // sanitize name: lowercase, replace spaces with -
    const sanitized = name.trim().toLowerCase().replace(/\s+/g, '-')
    await createChannel(serverId, sanitized, type)
    setLoading(false)
    setName(''); onClose()
  }
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={e=> e.stopPropagation()} className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Create Channel</h2>
        {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded p-2 mb-3">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-sm text-surface-300">Channel Type</label>
            <div className="flex gap-2 mt-1">
              <button onClick={()=> setType('text')} className={`flex-1 p-3 rounded-lg border text-left ${type==='text' ? 'bg-akay-600 border-akay-500 text-white' : 'bg-surface-800 border-surface-700 text-surface-300'}`}>
                <div className="font-medium"># Text</div><div className="text-xs opacity-80">Chat, share media</div>
              </button>
              <button onClick={()=> setType('voice')} className={`flex-1 p-3 rounded-lg border text-left ${type==='voice' ? 'bg-akay-600 border-akay-500 text-white' : 'bg-surface-800 border-surface-700 text-surface-300'}`}>
                <div className="font-medium">🔊 Voice</div><div className="text-xs opacity-80">Voice, video, screen</div>
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm text-surface-300">Channel Name</label>
            <div className="flex items-center gap-2">
              <span className="text-surface-500">{type==='text' ? '#' : '🔊'}</span>
              <Input value={name} onChange={e=> setName(e.target.value)} placeholder={type==='text' ? 'general' : 'General'} autoFocus />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handle} disabled={loading || !name.trim()}>{loading ? 'Creating…' : 'Create Channel'}</Button>
        </div>
      </div>
    </div>
  )
}
