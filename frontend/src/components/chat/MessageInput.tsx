import { useState, useRef } from 'react'
import { Send, Smile, Plus, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function MessageInput({ onSend, replyTo, onCancelReply, disabled }: { onSend: (content:string)=>void; replyTo?: { username: string; content: string } | null; onCancelReply?: ()=>void; disabled?: boolean }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
    inputRef.current?.focus()
  }

  return (
    <div className="p-3 bg-surface-900 border-t border-surface-800">
      {replyTo && (
        <div className="mb-2 flex items-center justify-between bg-surface-800 rounded px-3 py-2 border-l-4 border-akay-600">
          <div className="text-sm">
            <span className="font-medium text-white">Replying to {replyTo.username}</span>
            <span className="text-surface-400 ml-2 truncate max-w-[300px] inline-block align-bottom">{replyTo.content.slice(0,80)}</span>
          </div>
          <button onClick={onCancelReply} className="text-surface-400 hover:text-white p-1">✕</button>
        </div>
      )}
      <div className="flex items-end gap-2 bg-surface-800 rounded-xl px-2 py-2 border border-surface-700 focus-within:border-akay-600 focus-within:ring-1 focus-within:ring-akay-600/20">
        <button className="p-2 text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg" title="Attach">
          <Plus size={20} />
        </button>
        <input
          ref={inputRef}
          value={value}
          onChange={e=> setValue(e.target.value)}
          onKeyDown={e=> {
            if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder={disabled ? "Connecting..." : "Message... (Press Enter to send, Shift+Enter for new line)"}
          disabled={disabled}
          className="flex-1 bg-transparent text-white placeholder:text-surface-500 outline-none py-2 text-[15px]"
        />
        <div className="flex items-center gap-1">
          <button className="p-2 text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg" title="Emoji"><Smile size={18}/></button>
          <Button onClick={handleSend} disabled={!value.trim() || disabled} size="icon" className="rounded-lg h-8 w-8">
            <Send size={16}/>
          </Button>
        </div>
      </div>
      <div className="text-[11px] text-surface-500 mt-1.5 hidden md:block">Press Enter to send • Shift+Enter for new line • @mention</div>
    </div>
  )
}
