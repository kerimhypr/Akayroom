import { useEffect } from 'react'
import { X, Plus, Compass, Hash, Volume2, MicOff, Video, Monitor } from 'lucide-react'
import { useServerStore } from '@/stores/serverStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useAuthStore } from '@/stores/authStore'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/utils/cn'

function DrawerShell({
  open,
  onClose,
  side = 'left',
  children,
  title,
}: {
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  children: React.ReactNode
  title?: string
}) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative flex flex-col bg-surface-900 w-[82vw] max-w-[320px] h-[100dvh] shadow-2xl',
          side === 'left' ? 'animate-in slide-in-from-left' : 'animate-in slide-in-from-right ml-auto',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {title && (
          <div className="h-14 px-4 flex items-center justify-between border-b border-surface-800 shrink-0">
            <span className="font-semibold text-white truncate">{title}</span>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-surface-800 flex items-center justify-center text-surface-300">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

export function MobileServerDrawer({ open, onClose, onCreate, onJoin, onSelect }: { open: boolean; onClose: () => void; onCreate: () => void; onJoin: () => void; onSelect?: (tab: 'chat' | 'friends') => void }) {
  const { servers, currentServerId, setCurrentServer } = useServerStore()
  const { profile } = useAuthStore()
  return (
    <DrawerShell open={open} onClose={onClose} title="Servers">
      <div className="p-3 space-y-3">
        <button
          onClick={() => {
            setCurrentServer(null)
            onSelect?.('friends')
            onClose()
          }}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left',
            !currentServerId ? 'bg-akay-600 text-white' : 'bg-surface-800 text-surface-300',
          )}
        >
          <span className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center">👥</span>
          <span className="font-medium">Friends</span>
        </button>

        <div className="space-y-1">
          <div className="text-[11px] font-semibold tracking-widest text-surface-500 uppercase px-1">Your Servers</div>
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setCurrentServer(s.id)
                onSelect?.('chat')
                onClose()
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left',
                currentServerId === s.id ? 'bg-surface-800 text-white border border-surface-700' : 'hover:bg-surface-800 text-surface-200',
              )}
            >
              <span className="w-10 h-10 rounded-xl bg-akay-600 flex items-center justify-center text-sm font-bold shrink-0">
                {s.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{s.name}</span>
                <span className="block text-xs text-surface-400 truncate">Tap to open</span>
              </span>
              {currentServerId === s.id && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button onClick={() => { onClose(); onCreate() }} className="h-11 rounded-xl bg-emerald-600 text-white font-medium flex items-center justify-center gap-2">
            <Plus size={16} /> Create
          </button>
          <button onClick={() => { onClose(); onJoin() }} className="h-11 rounded-xl bg-surface-800 text-white font-medium flex items-center justify-center gap-2">
            <Compass size={16} /> Join
          </button>
        </div>

        <div className="flex items-center gap-3 pt-4 mt-2 border-t border-surface-800">
          <Avatar src={profile?.avatar_url} fallback={profile?.username ?? 'U'} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{profile?.display_name || profile?.username}</div>
            <div className="text-xs text-surface-400 truncate">@{profile?.username}</div>
          </div>
        </div>
      </div>
    </DrawerShell>
  )
}

export function MobileChannelDrawer({ open, onClose, onCreateChannel, onSelect }: { open: boolean; onClose: () => void; onCreateChannel: () => void; onSelect?: (tab: 'chat' | 'voice') => void }) {
  const { servers, currentServerId, channels, currentChannelId, setCurrentChannel, members } = useServerStore()
  const { roomId, participants } = useVoiceStore()
  const server = servers.find((s) => s.id === currentServerId)
  const textChannels = channels.filter((c) => c.type === 'text')
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  if (!server) {
    return (
      <DrawerShell open={open} onClose={onClose} title="Channels">
        <div className="p-4 text-sm text-surface-400">Select a server first</div>
      </DrawerShell>
    )
  }

  return (
    <DrawerShell open={open} onClose={onClose} title={server.name}>
      <div className="p-3 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-widest text-surface-400 uppercase">Text Channels</span>
            <button onClick={() => { onClose(); onCreateChannel() }} className="w-7 h-7 rounded-lg bg-surface-800 flex items-center justify-center text-surface-300">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {textChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setCurrentChannel(ch.id)
                  onSelect?.('chat')
                  onClose()
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left',
                  currentChannelId === ch.id ? 'bg-surface-800 text-white' : 'text-surface-400',
                )}
              >
                <Hash size={18} />
                <span className="text-[15px] truncate">{ch.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-widest text-surface-400 uppercase">Voice Channels</span>
            <button onClick={() => { onClose(); onCreateChannel() }} className="w-7 h-7 rounded-lg bg-surface-800 flex items-center justify-center text-surface-300">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {voiceChannels.map((ch) => {
              const isActive = roomId === `server:${server.id}:${ch.id}`
              return (
                <div key={ch.id} className={cn('rounded-xl', isActive && 'bg-surface-800')}>
                  <button
                    onClick={() => {
                      setCurrentChannel(ch.id)
                      onSelect?.('voice')
                      onClose()
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left',
                      currentChannelId === ch.id ? 'text-white' : 'text-surface-400',
                    )}
                  >
                    <Volume2 size={18} className={isActive ? 'text-emerald-400' : ''} />
                    <span className="text-[15px] truncate">{ch.name}</span>
                    {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                  </button>
                  {isActive && participants.size > 0 && (
                    <div className="px-3 pb-3 space-y-2">
                      {Array.from(participants.values()).map((p) => (
                        <div key={p.peerId} className="flex items-center gap-2 text-xs text-surface-300">
                          <Avatar src={p.avatarUrl} fallback={p.displayName} size={20} />
                          <span className="truncate">{p.displayName}</span>
                          {p.mediaState.micMuted && <MicOff size={12} className="text-red-400" />}
                          {p.mediaState.camEnabled && <Video size={12} className="text-emerald-400" />}
                          {p.mediaState.screenEnabled && <Monitor size={12} className="text-akay-400" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-surface-800">
          <div className="text-xs font-bold tracking-widest text-surface-400 uppercase mb-2">Members — {members.length}</div>
          <div className="space-y-2">
            {members.slice(0, 12).map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Avatar src={m.profile?.avatar_url} fallback={m.profile?.username ?? '?'} size={28} />
                <span className="text-sm text-white truncate flex-1">{m.profile?.display_name || m.profile?.username}</span>
                <span className={cn('w-2 h-2 rounded-full', m.profile?.status === 'online' ? 'bg-emerald-500' : 'bg-surface-600')} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  )
}
