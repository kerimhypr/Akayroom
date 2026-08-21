import { MessageSquare, Users, Mic, Settings, Hash } from 'lucide-react'
import { cn } from '@/utils/cn'

type Tab = 'chat' | 'friends' | 'voice' | 'settings'

export function MobileBottomNav({
  active,
  onChange,
  voiceActive,
  hasUnreadFriends,
}: {
  active: Tab
  onChange: (t: Tab) => void
  voiceActive?: boolean
  hasUnreadFriends?: boolean
}) {
  const tabs: { id: Tab; label: string; icon: any; badge?: boolean }[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'friends', label: 'Friends', icon: Users, badge: hasUnreadFriends },
    { id: 'voice', label: 'Voice', icon: Mic },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-950/95 backdrop-blur-xl border-t border-surface-800 flex items-stretch"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      aria-label="Mobile navigation"
    >
      {tabs.map(({ id, label, icon: Icon, badge }) => {
        const isActive = active === id
        const isVoiceLive = id === 'voice' && voiceActive
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[64px] relative transition-colors',
              isActive ? 'text-white' : 'text-surface-400 active:text-surface-200',
            )}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span
              className={cn(
                'relative flex items-center justify-center w-7 h-7 rounded-xl transition-all',
                isActive && 'bg-akay-600 text-white shadow-lg shadow-akay-600/20',
                isVoiceLive && !isActive && 'bg-emerald-600 text-white animate-pulse',
              )}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {badge && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-surface-950" />
              )}
            </span>
            <span className={cn('text-[10px] font-medium leading-none', isActive && 'text-white')}>
              {label}
            </span>
            {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-akay-500 rounded-full" />}
          </button>
        )
      })}
    </nav>
  )
}

export function MobileHeader({
  serverName,
  channelName,
  channelType,
  onOpenServers,
  onOpenChannels,
}: {
  serverName?: string | null
  channelName?: string | null
  channelType?: 'text' | 'voice' | null
  onOpenServers: () => void
  onOpenChannels: () => void
}) {
  return (
    <header className="md:hidden h-[56px] shrink-0 flex items-center gap-2 px-3 bg-surface-900 border-b border-surface-800 sticky top-0 z-30">
      <button
        onClick={onOpenServers}
        className="w-10 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 flex items-center justify-center text-white shrink-0"
        aria-label="Open servers"
      >
        <span className="w-6 h-6 rounded-lg bg-akay-600 flex items-center justify-center text-[10px] font-bold">
          {(serverName ?? 'A').slice(0, 2).toUpperCase()}
        </span>
      </button>

      <button
        onClick={onOpenChannels}
        className="flex-1 min-w-0 flex items-center gap-2 bg-surface-800 hover:bg-surface-700 rounded-xl px-3 py-2 text-left"
      >
        <span className={cn('shrink-0', channelType === 'voice' ? 'text-emerald-400' : 'text-surface-400')}>
          {channelType === 'voice' ? <Mic size={16} /> : <Hash size={16} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-white truncate leading-none">
            {channelName ?? serverName ?? 'Friends'}
          </span>
          <span className="block text-[11px] text-surface-400 truncate leading-none">
            {serverName ? `${serverName} • ${channelType ?? 'text'}` : 'Direct messages'}
          </span>
        </span>
      </button>
    </header>
  )
}
