import { MessageSquare, Users, Mic, Settings, Hash, ChevronDown } from 'lucide-react'
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
  const tabs: { id: Tab; label: string; icon: typeof MessageSquare; badge?: boolean }[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'friends', label: 'Friends', icon: Users, badge: hasUnreadFriends },
    { id: 'voice', label: 'Voice', icon: Mic },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-surface-800/90 bg-surface-950"
      style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-4 h-[60px]">
        {tabs.map(({ id, label, icon: Icon, badge }) => {
          const isActive = active === id
          const isVoiceLive = id === 'voice' && voiceActive

          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={cn(
                'relative flex min-w-0 flex-col items-center justify-center gap-1 text-xs transition-colors',
                'active:bg-surface-900',
                isActive ? 'text-white' : 'text-surface-500',
              )}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className={cn(
                  'relative flex h-8 w-10 items-center justify-center rounded-lg',
                  isActive && 'bg-surface-800 text-white',
                  isVoiceLive && !isActive && 'text-emerald-400',
                )}
              >
                <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                {badge && <span className="absolute right-1 top-0.5 h-2 w-2 rounded-full bg-red-500" />}
              </span>
              <span className={cn('leading-none', isActive ? 'font-medium' : 'font-normal')}>{label}</span>
              {isVoiceLive && <span className="absolute bottom-1 h-0.5 w-5 rounded-full bg-emerald-500" />}
            </button>
          )
        })}
      </div>
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
  const title = channelName ?? serverName ?? 'Friends'
  const subtitle = serverName ? serverName : 'Your conversations'

  return (
    <header className="md:hidden shrink-0 border-b border-surface-800/90 bg-surface-900/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex h-14 items-center gap-2">
        <button
          type="button"
          onClick={onOpenServers}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-800 text-white active:bg-surface-700"
          aria-label="Open servers"
        >
          <span className="text-sm font-semibold">{(serverName ?? 'A').slice(0, 2).toUpperCase()}</span>
        </button>

        <button
          type="button"
          onClick={onOpenChannels}
          className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left active:bg-surface-800"
          aria-label="Open channels"
        >
          <div className="flex items-center gap-2">
            {channelType === 'voice' ? (
              <Mic size={15} className="shrink-0 text-emerald-400" />
            ) : (
              <Hash size={15} className="shrink-0 text-surface-400" />
            )}
            <span className="truncate text-[15px] font-semibold text-white">{title}</span>
            <ChevronDown size={15} className="shrink-0 text-surface-500" />
          </div>
          <div className="truncate pl-[23px] text-[11px] text-surface-500">{subtitle}</div>
        </button>
      </div>
    </header>
  )
}
