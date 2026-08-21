import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import type { Message } from '@/types/database'

type MessageState = {
  messagesByChannel: Record<string, Message[]>
  loadingByChannel: Record<string, boolean>
  hasMoreByChannel: Record<string, boolean>
  typingUsers: Record<string, string[]> // channelId -> userIds
  fetchMessages: (channelId: string, limit?: number) => Promise<void>
  fetchMore: (channelId: string) => Promise<void>
  sendMessage: (channelId: string, serverId: string, content: string, replyTo?: string | null) => Promise<void>
  editMessage: (messageId: string, content: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  addMessage: (msg: Message) => void
  updateMessage: (msg: Message) => void
  removeMessage: (id: string, channelId: string) => void
  subscribeChannel: (channelId: string) => () => void
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesByChannel: {},
  loadingByChannel: {},
  hasMoreByChannel: {},
  typingUsers: {},

  fetchMessages: async (channelId, limit = 50) => {
    set(s => ({ loadingByChannel: { ...s.loadingByChannel, [channelId]: true } }))
    const { data, error } = await supabase
      .from('messages')
      .select('*, profile:profiles!messages_user_id_fkey(*)')
      .eq('channel_id', channelId)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (!error && data) {
      const msgs = (data as unknown as Message[]).reverse()
      set(s => ({
        messagesByChannel: { ...s.messagesByChannel, [channelId]: msgs },
        hasMoreByChannel: { ...s.hasMoreByChannel, [channelId]: data.length === limit },
        loadingByChannel: { ...s.loadingByChannel, [channelId]: false },
      }))
    } else {
      set(s => ({ loadingByChannel: { ...s.loadingByChannel, [channelId]: false } }))
    }
  },

  fetchMore: async (channelId) => {
    const current = get().messagesByChannel[channelId] ?? []
    if (current.length === 0) return
    const oldest = current[0].created_at
    const { data } = await supabase
      .from('messages')
      .select('*, profile:profiles!messages_user_id_fkey(*)')
      .eq('channel_id', channelId)
      .eq('deleted', false)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data && data.length > 0) {
      const more = (data as unknown as Message[]).reverse()
      set(s => ({
        messagesByChannel: { ...s.messagesByChannel, [channelId]: [...more, ...current] },
        hasMoreByChannel: { ...s.hasMoreByChannel, [channelId]: data.length === 50 },
      }))
    } else {
      set(s => ({ hasMoreByChannel: { ...s.hasMoreByChannel, [channelId]: false } }))
    }
  },

  sendMessage: async (channelId, serverId, content, replyTo) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('messages').insert({
      channel_id: channelId,
      server_id: serverId,
      user_id: user.id,
      content: content.trim(),
      reply_to: replyTo ?? null,
    })
    if (error) console.error('sendMessage', error)
  },

  editMessage: async (messageId, content) => {
    const { error } = await supabase.from('messages').update({ content, edited: true }).eq('id', messageId)
    if (error) console.error(error)
  },

  deleteMessage: async (messageId) => {
    const { error } = await supabase.from('messages').update({ deleted: true, content: '[deleted]' }).eq('id', messageId)
    if (error) console.error(error)
  },

  addMessage: (msg) => set(s => {
    const arr = s.messagesByChannel[msg.channel_id] ?? []
    // dedup
    if (arr.some(m => m.id === msg.id)) return s
    return { messagesByChannel: { ...s.messagesByChannel, [msg.channel_id]: [...arr, msg] } }
  }),

  updateMessage: (msg) => set(s => {
    const arr = s.messagesByChannel[msg.channel_id] ?? []
    return {
      messagesByChannel: {
        ...s.messagesByChannel,
        [msg.channel_id]: arr.map(m => m.id === msg.id ? { ...m, ...msg } : m),
      },
    }
  }),

  removeMessage: (id, channelId) => set(s => {
    const arr = s.messagesByChannel[channelId] ?? []
    return {
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: arr.filter(m => m.id !== id),
      },
    }
  }),

  subscribeChannel: (channelId) => {
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, async (payload) => {
        const newMsg = payload.new as Message
        // fetch profile
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', newMsg.user_id).single()
        get().addMessage({ ...newMsg, profile: profile as any })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        const upd = payload.new as Message
        if (upd.deleted) get().removeMessage(upd.id, channelId)
        else get().updateMessage(upd)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        const old = payload.old as Message
        get().removeMessage(old.id, channelId)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  },
}))
