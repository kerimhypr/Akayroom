import { useEffect, useState } from 'react'
import { useFriendStore } from '@/stores/friendStore'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, X, UserPlus, Users, Search, Ban, Trash2 } from 'lucide-react'

export function FriendsPanel() {
  const { friends, incoming, outgoing, searchResults, fetchFriends, fetchRequests, sendRequest, acceptRequest, rejectRequest, removeFriend, searchUsers } = useFriendStore()
  const [activeTab, setActiveTab] = useState<'online'|'all'|'pending'|'add'>('all')
  const [username, setUsername] = useState('')
  const [addError, setAddError] = useState<string| null>(null)
  const [addSuccess, setAddSuccess] = useState<string| null>(null)
  const [searchQ, setSearchQ] = useState('')

  useEffect(()=> { fetchFriends(); fetchRequests() }, [])
  useEffect(()=> { if (searchQ) searchUsers(searchQ); else searchUsers('') }, [searchQ])

  const handleAdd = async () => {
    setAddError(null); setAddSuccess(null)
    const err = await sendRequest(username.trim())
    if (err) setAddError(err)
    else { setAddSuccess('İstek gönderildi'); setUsername('') }
  }

  return (
    <div className="flex-1 flex flex-col bg-surface-900">
      {/* Tabs */}
      <div className="h-12 border-b border-surface-800 flex items-center gap-2 px-4 bg-surface-900">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Users size={18} className="text-surface-400" /> Friends
        </div>
        <div className="w-px h-6 bg-surface-700 mx-2" />
        <button onClick={()=> setActiveTab('online')} className={`px-2 py-1 rounded text-sm ${activeTab==='online' ? 'bg-surface-800 text-white' : 'text-surface-400 hover:bg-surface-800 hover:text-white'}`}>Online</button>
        <button onClick={()=> setActiveTab('all')} className={`px-2 py-1 rounded text-sm ${activeTab==='all' ? 'bg-surface-800 text-white' : 'text-surface-400 hover:bg-surface-800 hover:text-white'}`}>All</button>
        <button onClick={()=> setActiveTab('pending')} className={`px-2 py-1 rounded text-sm flex items-center gap-1 ${activeTab==='pending' ? 'bg-surface-800 text-white' : 'text-surface-400 hover:bg-surface-800 hover:text-white'}`}>
          Pending {incoming.length>0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{incoming.length}</span>}
        </button>
        <button onClick={()=> setActiveTab('add')} className={`px-3 py-1 rounded text-sm font-medium ${activeTab==='add' ? 'bg-emerald-600 text-white' : 'bg-akay-600 text-white hover:bg-akay-500'}`}>Add Friend</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab==='add' && (
          <div className="max-w-xl space-y-4">
            <h3 className="font-semibold text-white">Add Friend</h3>
            <p className="text-sm text-surface-400">You can add friends with their username.</p>
            <div className="flex gap-2">
              <Input placeholder="Username (e.g. kerim_123)" value={username} onChange={e=> setUsername(e.target.value)} className="flex-1" />
              <Button onClick={handleAdd} disabled={!username.trim()}>Send Request</Button>
            </div>
            {addError && <div className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded p-2">{addError}</div>}
            {addSuccess && <div className="text-sm text-emerald-400 bg-emerald-950/50 border border-emerald-900 rounded p-2">{addSuccess}</div>}
            <div className="pt-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                <Input placeholder="Search users..." value={searchQ} onChange={e=> setSearchQ(e.target.value)} className="pl-9" />
              </div>
              {searchResults.length>0 && (
                <div className="mt-3 space-y-1">
                  {searchResults.map(u=>(
                    <div key={u.id} className="flex items-center justify-between p-2 hover:bg-surface-800 rounded">
                      <div className="flex items-center gap-2">
                        <Avatar src={u.avatar_url} fallback={u.username} size={32}/>
                        <div>
                          <div className="text-sm text-white">{u.display_name || u.username}</div>
                          <div className="text-xs text-surface-400">@{u.username}</div>
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={()=> { setUsername(u.username); setActiveTab('add')}}><UserPlus size={14}/> Add</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-surface-800 pt-4">
              <h4 className="text-sm font-medium text-white mb-2">Outgoing Requests</h4>
              {outgoing.length===0 ? <div className="text-sm text-surface-500">No outgoing requests</div> : outgoing.map(r=>(
                <div key={r.id} className="flex items-center justify-between p-2 bg-surface-800 rounded mb-1">
                  <div className="flex items-center gap-2">
                    <Avatar src={r.receiver?.avatar_url} fallback={r.receiver?.username ?? '?'} size={32}/>
                    <span className="text-sm text-white">{r.receiver?.username}</span>
                  </div>
                  <span className="text-xs text-surface-400">Pending</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab==='pending' && (
          <div className="space-y-3 max-w-xl">
            <h3 className="font-medium text-white">Incoming Requests — {incoming.length}</h3>
            {incoming.length===0 ? <div className="text-sm text-surface-500">No pending requests</div> : incoming.map(r=>(
              <div key={r.id} className="flex items-center justify-between p-3 bg-surface-800 rounded-lg border border-surface-700">
                <div className="flex items-center gap-3">
                  <Avatar src={r.sender?.avatar_url} fallback={r.sender?.username ?? '?'} size={40}/>
                  <div>
                    <div className="text-white font-medium">{r.sender?.display_name || r.sender?.username}</div>
                    <div className="text-xs text-surface-400">@{r.sender?.username}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="icon" onClick={()=> acceptRequest(r.id)} title="Accept"><Check size={16}/></Button>
                  <Button size="icon" variant="destructive" onClick={()=> rejectRequest(r.id)} title="Reject"><X size={16}/></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {(activeTab==='all' || activeTab==='online') && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-2">
              {activeTab==='all' ? `All Friends — ${friends.length}` : `Online — ${friends.filter(f=> f.status==='online').length}`}
            </h3>
            {friends.length===0 ? (
              <div className="text-center py-12 text-surface-500">
                <Users size={48} className="mx-auto mb-3 opacity-30"/>
                <p>No friends yet</p>
                <p className="text-sm mt-1">Add friends to start chatting</p>
                <Button className="mt-4" onClick={()=> setActiveTab('add')}>Add Friend</Button>
              </div>
            ) : friends.filter(f=> activeTab==='online' ? f.status==='online' : true).map(f=>(
              <div key={f.id} className="flex items-center justify-between p-2 hover:bg-surface-800 rounded group">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar src={f.avatar_url} fallback={f.username} size={32}/>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-900 ${f.status==='online' ? 'bg-emerald-500' : f.status==='idle' ? 'bg-yellow-500' : 'bg-surface-600'}`} />
                  </div>
                  <div>
                    <div className="text-sm text-white">{f.display_name || f.username}</div>
                    <div className="text-xs text-surface-400">{f.status} • @{f.username}</div>
                  </div>
                </div>
                <div className="hidden group-hover:flex gap-1">
                  <Button size="icon" variant="ghost" title="Message"><Users size={16}/></Button>
                  <Button size="icon" variant="ghost" onClick={()=> removeFriend(f.id)} title="Remove"><Trash2 size={16}/></Button>
                  <Button size="icon" variant="ghost" title="Block"><Ban size={16}/></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
