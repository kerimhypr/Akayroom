import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Plus, Compass, LogOut, Settings, Users } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/utils/cn'

export function ServerSidebar({ onCreate, onJoin }: { onCreate: ()=>void; onJoin: ()=>void }) {
  const { servers, currentServerId, setCurrentServer } = useServerStore()
  const { profile } = useAuthStore()
  return (
    <div className="w-[72px] bg-surface-950 flex flex-col items-center py-3 gap-2 shrink-0 border-r border-surface-800 overflow-y-auto scrollbar-thin">
      {/* Home / Friends */}
      <button
        onClick={()=> setCurrentServer(null)}
        className={cn("w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all bg-surface-800 hover:bg-akay-600 text-white", !currentServerId && "bg-akay-600 rounded-[16px]")}
        aria-label="Friends"
        title="Friends"
      >
        <Users size={24} />
      </button>
      <div className="w-8 h-0.5 bg-surface-800 rounded-full" />
      {servers.map(s => (
        <button
          key={s.id}
          onClick={()=> setCurrentServer(s.id)}
          className={cn("w-12 h-12 flex items-center justify-center text-white font-bold transition-all relative group",
            currentServerId===s.id ? "rounded-[16px] bg-akay-600" : "rounded-[24px] bg-surface-800 hover:rounded-[16px] hover:bg-akay-600"
          )}
          title={s.name}
        >
          {s.icon_url ? <img src={s.icon_url} alt={s.name} className="w-full h-full object-cover rounded-[inherit]" /> : s.name.slice(0,2).toUpperCase()}
          {currentServerId===s.id && <div className="absolute -left-3 w-1 h-8 bg-white rounded-r-full" />}
          <span className="absolute left-[72px] top-1/2 -translate-y-1/2 hidden group-hover:block bg-surface-900 text-white text-sm px-2 py-1 rounded whitespace-nowrap z-50 border border-surface-700">{s.name}</span>
        </button>
      ))}
      <button onClick={onCreate} className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-surface-800 hover:bg-emerald-600 text-emerald-400 hover:text-white flex items-center justify-center transition-all group" aria-label="Create server" title="Create server">
        <Plus size={24} />
      </button>
      <button onClick={onJoin} className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-surface-800 hover:bg-emerald-600 text-emerald-400 hover:text-white flex items-center justify-center transition-all" aria-label="Join server" title="Join server">
        <Compass size={24} />
      </button>
      <div className="mt-auto flex flex-col gap-2">
        <Avatar src={profile?.avatar_url} fallback={profile?.username ?? 'U'} size={40} />
      </div>
    </div>
  )
}
