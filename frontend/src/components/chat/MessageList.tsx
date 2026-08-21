import { useEffect, useRef, useState } from 'react'
import { useMessageStore } from '@/stores/messageStore'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Reply, Edit2, Trash2 } from 'lucide-react'
import type { Message } from '@/types/database'
import { cn } from '@/utils/cn'

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('tr-TR')
}

export function MessageList({ channelId, onReply }: { channelId: string; onReply: (msg: Message)=>void }) {
  const { messagesByChannel, hasMoreByChannel, fetchMore } = useMessageStore()
  const messages = messagesByChannel[channelId] ?? []
  const hasMore = hasMoreByChannel[channelId]
  const containerRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [editContent, setEditContent] = useState('')
  const { editMessage, deleteMessage } = useMessageStore()

  // Auto scroll to bottom when new messages arrive if already near bottom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (isNearBottom) el.scrollTop = el.scrollHeight
  }, [messages.length])

  // initial scroll to bottom
  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [channelId])

  if (messages.length===0) {
    return (
      <div ref={containerRef} className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mb-4 text-2xl">💬</div>
        <h3 className="font-semibold text-white">No messages yet</h3>
        <p className="text-sm text-surface-400 mt-1 max-w-md">This is the beginning of the channel. Send a message to start the conversation.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-0.5 scrollbar-thin" onScroll={(e)=>{
      const el = e.currentTarget
      if (el.scrollTop < 100 && hasMore) fetchMore(channelId)
    }}>
      {hasMore && (
        <button onClick={()=> fetchMore(channelId)} className="mx-auto block text-xs text-akay-400 hover:text-akay-300 py-2">Load older messages</button>
      )}
      {messages.map((m, idx) => {
        const prev = messages[idx-1]
        const showHeader = !prev || prev.user_id !== m.user_id || (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 7*60*1000)
        const isEditing = editingId===m.id
        return (
          <div key={m.id} className={cn("group flex gap-3 px-2 py-1 rounded hover:bg-surface-900/60", m.deleted && "opacity-60")}>
            {showHeader ? (
              <Avatar src={m.profile?.avatar_url} fallback={m.profile?.username ?? '?'} size={40} className="mt-1" />
            ) : <div className="w-10 shrink-0" />}
            <div className="flex-1 min-w-0">
              {showHeader && (
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-white text-[15px]">{m.profile?.display_name || m.profile?.username || 'Unknown'}</span>
                  <span className="text-xs text-surface-500">{formatTime(m.created_at)}</span>
                  {m.edited && <span className="text-[10px] text-surface-500">(edited)</span>}
                </div>
              )}
              {m.reply_to && (
                <div className="text-xs text-surface-400 border-l-2 border-surface-700 pl-2 mb-1 opacity-80">Replying…</div>
              )}
              {isEditing ? (
                <div className="flex gap-2 mt-1">
                  <input value={editContent} onChange={e=> setEditContent(e.target.value)} className="flex-1 bg-surface-800 border border-surface-700 rounded px-2 py-1 text-sm text-white" autoFocus />
                  <Button size="sm" onClick={async()=> { await editMessage(m.id, editContent); setEditingId(null)}}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={()=> setEditingId(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="text-[15px] leading-[1.35] text-surface-100 break-words whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
            <div className="hidden group-hover:flex items-center gap-1 self-start bg-surface-800 border border-surface-700 rounded-lg p-1 shadow-lg">
              <button onClick={()=> onReply(m)} className="p-1.5 hover:bg-surface-700 rounded text-surface-300 hover:text-white" title="Reply"><Reply size={14}/></button>
              <button onClick={()=> { setEditingId(m.id); setEditContent(m.content)}} className="p-1.5 hover:bg-surface-700 rounded text-surface-300 hover:text-white" title="Edit"><Edit2 size={14}/></button>
              <button onClick={()=> { if(confirm('Delete message?')) deleteMessage(m.id)}} className="p-1.5 hover:bg-red-900/50 rounded text-surface-300 hover:text-red-400" title="Delete"><Trash2 size={14}/></button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
