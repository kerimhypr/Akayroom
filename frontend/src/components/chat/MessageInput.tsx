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
    <div
      className="p-2 md:p-3 bg-surface-900 border-t border-surface-800 shrink-0"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      {replyTo && (
        <div className="mb-2 flex items-center justify-between bg-surface-800 rounded-xl px-3 py-2.5 border-l-4 border-akay-600">
          <div className="text-sm min-w-0 flex-1">
            <span className="font-medium text-white">Replying to {replyTo.username}</span>
            <span className="text-surface-400 ml-2 truncate max-w-[180px] md:max-w-[300px] inline-block align-bottom">
              {replyTo.content.slice(0, 80)}
            </span>
          </div>
          <button onClick={onCancelReply} className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center text-surface-300 shrink-0 ml-2">
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5 md:gap-2 bg-surface-800 rounded-2xl md:rounded-xl px-1.5 md:px-2 py-1.5 md:py-2 border border-surface-700 focus-within:border-akay-600 focus-within:ring-1 focus-within:ring-akay-600/20">
        <button className="hidden md:flex p-2 text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg shrink-0" title="Attach">
          <Plus size={20} />
        </button>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={disabled ? 'Connecting...' : 'Message...'}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent text-white placeholder:text-surface-500 outline-none py-2.5 md:py-2 text-[15px] leading-none"
          enterKeyHint="send"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button className="hidden md:flex p-2 text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg" title="Emoji">
            <Smile size={18} />
          </button>
          <Button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            size="icon"
            className="rounded-xl md:rounded-lg h-10 w-10 md:h-8 md:w-8 shrink-0"
          >
            <Send size={18} className="md:w-4 md:h-4" />
          </Button>
        </div>
      </div>
      <div className="text-[11px] text-surface-500 mt-1.5 hidden md:block">Press Enter to send • Shift+Enter for new line • @mention</div>
    </div>
  )
}
