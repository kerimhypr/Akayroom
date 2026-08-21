import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import type { Profile, FriendRequest, Friendship } from '@/types/database'

type FriendState = {
  friends: Profile[]
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
  searchResults: Profile[]
  loading: boolean
  fetchFriends: () => Promise<void>
  fetchRequests: () => Promise<void>
  sendRequest: (username: string) => Promise<string | null>
  acceptRequest: (id: string) => Promise<void>
  rejectRequest: (id: string) => Promise<void>
  removeFriend: (friendId: string) => Promise<void>
  blockUser: (userId: string) => Promise<void>
  searchUsers: (q: string) => Promise<void>
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  searchResults: [],
  loading: false,

  fetchFriends: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('friendships').select('friend:profiles!friendships_friend_id_fkey(*)').eq('user_id', user.id)
    if (!error && data) set({ friends: (data as any).map((r:any)=> r.friend).filter(Boolean) })
  },

  fetchRequests: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    set({ loading: true })
    const { data: incoming } = await supabase.from('friend_requests').select('*, sender:profiles!friend_requests_sender_id_fkey(*)').eq('receiver_id', user.id).eq('status', 'pending')
    const { data: outgoing } = await supabase.from('friend_requests').select('*, receiver:profiles!friend_requests_receiver_id_fkey(*)').eq('sender_id', user.id).eq('status', 'pending')
    set({ incoming: (incoming as any) ?? [], outgoing: (outgoing as any) ?? [], loading: false })
  },

  sendRequest: async (username) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Not authenticated'
    const { data: target } = await supabase.from('profiles').select('*').eq('username', username).single()
    if (!target) return 'Kullanıcı bulunamadı'
    if (target.id === user.id) return 'Kendine istek gönderemezsin'
    const { error } = await supabase.from('friend_requests').insert({ sender_id: user.id, receiver_id: target.id })
    if (error) {
      if (error.code === '23505') return 'Zaten istek gönderilmiş'
      return error.message
    }
    await get().fetchRequests()
    return null
  },

  acceptRequest: async (id) => {
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', id)
    await get().fetchRequests()
    await get().fetchFriends()
  },

  rejectRequest: async (id) => {
    await supabase.from('friend_requests').update({ status: 'rejected' }).eq('id', id)
    await get().fetchRequests()
  },

  removeFriend: async (friendId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('friendships').delete().eq('user_id', user.id).eq('friend_id', friendId)
    await supabase.from('friendships').delete().eq('user_id', friendId).eq('friend_id', user.id)
    // also cancel accepted requests
    await supabase.from('friend_requests').delete().or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
    await get().fetchFriends()
  },

  blockUser: async (userId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('friend_requests').upsert({ sender_id: user.id, receiver_id: userId, status: 'blocked' }, { onConflict: 'sender_id,receiver_id' })
    await get().removeFriend(userId)
  },

  searchUsers: async (q) => {
    if (!q.trim()) { set({ searchResults: [] }); return }
    const { data } = await supabase.rpc('search_users', { q })
    set({ searchResults: (data as Profile[]) ?? [] })
  },
}))
