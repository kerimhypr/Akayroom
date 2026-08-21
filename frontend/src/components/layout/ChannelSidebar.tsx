import { useServerStore } from '@/stores/serverStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { Hash, Volume2, Settings, Mic, MicOff, Headphones, Video, Monitor, PhoneOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/utils/cn'
import { useState } from 'react'

export function ChannelSidebar({ onCreateChannel }: { onCreateChannel: () => void }) {
  const { servers, currentServerId, channels, currentChannelId, setCurrentChannel, members } = useServerStore()
  const { status, roomId, participants, isMuted, isDeafened, isCameraOn, isScreenSharing, setMuted, setDeafened } = useVoiceStore()
  const { profile, signOut } = useAuthStore()
  const server = servers.find(s=> s.id===currentServerId)
  const textChannels = channels.filter(c=> c.type==='text')
  const voiceChannels = channels.filter(c=> c.type==='voice')

  if (!currentServerId || !server) {
    return (
      <div className="w-[240px] bg-surface-900 flex flex-col border-r border-surface-800 shrink-0">
        <div className="h-12 px-4 flex items-center font-bold border-b border-surface-800">Friends</div>
        <div className="p-2 text-sm text-surface-400">Select a server or manage friends</div>
      </div>
    )
  }

  return (
    <div className="w-[240px] bg-surface-900 flex flex-col border-r border-surface-800 shrink-0">
      <div className="h-12 px-4 flex items-center justify-between font-semibold border-b border-surface-800 shadow-sm">
        <span className="truncate">{server.name}</span>
        <button className="p-1 hover:bg-surface-800 rounded" title="Server settings"><Settings size={16} className="text-surface-400" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin">
        <div>
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Text Channels</span>
            <button onClick={onCreateChannel} className="text-surface-400 hover:text-white p-1"><span className="text-lg leading-none">+</span></button>
          </div>
          <div className="space-y-0.5">
            {textChannels.map(ch=>(
              <button key={ch.id} onClick={()=> setCurrentChannel(ch.id)} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors", currentChannelId===ch.id ? "bg-surface-800 text-white" : "text-surface-400 hover:bg-surface-800 hover:text-surface-100")}>
                <Hash size={18} className="shrink-0" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
            {textChannels.length===0 && <div className="text-xs text-surface-500 px-2 py-1">No text channels</div>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Voice Channels</span>
            <button onClick={onCreateChannel} className="text-surface-400 hover:text-white p-1"><span className="text-lg leading-none">+</span></button>
          </div>
          <div className="space-y-0.5">
            {voiceChannels.map(ch=>(
              <div key={ch.id} className={cn("rounded", roomId===`server:${server.id}:${ch.id}` ? "bg-surface-800" : "")}>
                <button onClick={()=> setCurrentChannel(ch.id)} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors", currentChannelId===ch.id ? "text-white" : "text-surface-400 hover:text-surface-100")}>
                  <Volume2 size={18} className={cn(currentChannelId===ch.id && roomId ? "text-emerald-400" : "")} />
                  <span className="truncate">{ch.name}</span>
                </button>
                {/* participants preview when connected to this voice channel */}
                {roomId===`server:${server.id}:${ch.id}` && participants.size>0 && (
                  <div className="ml-6 mr-2 mb-2 space-y-1">
                    {Array.from(participants.values()).map(p=>(
                      <div key={p.peerId} className="flex items-center gap-2 text-xs text-surface-300">
                        <Avatar src={p.avatarUrl} fallback={p.displayName} size={20} />
                        <span className="truncate flex-1">{p.displayName}</span>
                        {p.mediaState.micMuted && <MicOff size={12} className="text-red-400" />}
                        {p.mediaState.camEnabled && <Video size={12} className="text-emerald-400" />}
                        {p.mediaState.screenEnabled && <Monitor size={12} className="text-akay-400" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-surface-800">
          <div className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-2 px-1">Members — {members.length}</div>
          <div className="space-y-1">
            {members.map(m=>(
              <div key={m.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-800">
                <Avatar src={m.profile?.avatar_url} fallback={m.profile?.username ?? '?'} size={24} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{m.profile?.display_name || m.profile?.username}</div>
                  <div className="text-xs text-surface-400 truncate">{m.role}</div>
                </div>
                <div className={`w-2 h-2 rounded-full ${m.profile?.status==='online' ? 'bg-emerald-500' : m.profile?.status==='idle' ? 'bg-yellow-500' : 'bg-surface-600'}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Voice status panel */}
      {status!=='disconnected' && (
        <div className="p-2 bg-surface-950 border-t border-surface-800">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className={cn("flex items-center gap-1.5", status==='connected' ? "text-emerald-400" : status==='connecting' || status==='reconnecting' ? "text-yellow-400" : "text-red-400")}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              {status==='connected' ? 'Connected' : status==='reconnecting' ? 'Reconnecting…' : status==='connecting' ? 'Connecting…' : status}
            </span>
            <span className="text-surface-400 truncate max-w-[100px]">{voiceChannels.find(c=> `server:${server.id}:${c.id}`===roomId)?.name ?? roomId}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant={isMuted ? "destructive" : "secondary"} className="flex-1 h-8" onClick={()=> setMuted(!isMuted)} title={isMuted ? "Unmute" : "Mute"}>
              {isMuted ? <MicOff size={16}/> : <Mic size={16}/>}
            </Button>
            <Button size="icon" variant={isDeafened ? "destructive" : "secondary"} className="flex-1 h-8" onClick={()=> setDeafened(!isDeafened)} title={isDeafened ? "Undeafen" : "Deafen"}>
              <Headphones size={16}/>
            </Button>
            <Button size="icon" variant="destructive" className="flex-1 h-8" onClick={()=> {
              // leave handled via hook
              window.dispatchEvent(new CustomEvent('akay:leave-voice'))
            }} title="Disconnect">
              <PhoneOff size={16}/>
            </Button>
          </div>
        </div>
      )}

      {/* User panel */}
      <div className="h-[52px] bg-surface-950 border-t border-surface-800 px-2 flex items-center gap-2">
        <Avatar src={profile?.avatar_url} fallback={profile?.username ?? 'U'} size={32} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{profile?.display_name || profile?.username}</div>
          <div className="text-xs text-surface-400 truncate">#{profile?.username} • {profile?.status}</div>
        </div>
        <button onClick={()=> signOut()} className="p-2 hover:bg-surface-800 rounded text-surface-400 hover:text-white" title="Logout"><Settings size={16}/></button>
      </div>
    </div>
  )
}
