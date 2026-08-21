import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import type { Server, Channel, ServerMember } from '@/types/database'

type ServerState = {
  servers: Server[]
  currentServerId: string | null
  channels: Channel[]
  currentChannelId: string | null
  members: ServerMember[]
  loading: boolean
  fetchServers: () => Promise<void>
  createServer: (name: string, description?: string) => Promise<Server | null>
  joinServer: (inviteCode: string) => Promise<boolean>
  leaveServer: (serverId: string) => Promise<void>
  setCurrentServer: (id: string | null) => void
  setCurrentChannel: (id: string | null) => void
  fetchChannels: (serverId: string) => Promise<void>
  createChannel: (serverId: string, name: string, type: 'text'|'voice') => Promise<void>
  fetchMembers: (serverId: string) => Promise<void>
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServerId: null,
  channels: [],
  currentChannelId: null,
  members: [],
  loading: false,

  fetchServers: async () => {
    set({ loading: true })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { set({ servers: [], loading: false }); return }
    // fetch via join table
    const { data, error } = await supabase.from('server_members').select('server_id, servers(*)').eq('user_id', user.id)
    if (error) {
      console.error('fetchServers error', error)
      set({ loading: false }); return
    }
    const servers = (data as any[]).map(r => r.servers).filter(Boolean) as Server[]
    // deduplicate
    const uniq = Array.from(new Map(servers.map(s => [s.id, s])).values())
    set({ servers: uniq, loading: false })
    // auto-select first if none
    if (!get().currentServerId && uniq.length > 0) {
      get().setCurrentServer(uniq[0].id)
    }
  },

  createServer: async (name, description) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase.from('servers').insert({ name, description, owner_id: user.id }).select().single()
    if (error) { console.error(error); return null }
    await get().fetchServers()
    if (data) get().setCurrentServer(data.id)
    return data as Server
  },

  joinServer: async (inviteCode) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data: server, error: sErr } = await supabase.from('servers').select('*').eq('invite_code', inviteCode).single()
    if (sErr || !server) return false
    const { error } = await supabase.from('server_members').insert({ server_id: server.id, user_id: user.id, role: 'member' })
    if (error) { console.error(error); return false }
    await get().fetchServers()
    get().setCurrentServer(server.id)
    return true
  },

  leaveServer: async (serverId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('server_members').delete().eq('server_id', serverId).eq('user_id', user.id)
    set(state => ({
      servers: state.servers.filter(s => s.id !== serverId),
      currentServerId: state.currentServerId === serverId ? (state.servers.find(s => s.id !== serverId)?.id ?? null) : state.currentServerId,
    }))
    if (get().currentServerId === serverId) {
      const remaining = get().servers
      if (remaining.length > 0) get().setCurrentServer(remaining[0].id)
      else set({ currentServerId: null, channels: [], currentChannelId: null })
    }
  },

  setCurrentServer: (id) => {
    set({ currentServerId: id, currentChannelId: null, channels: [], members: [] })
    if (id) {
      get().fetchChannels(id)
      get().fetchMembers(id)
    }
  },

  setCurrentChannel: (id) => set({ currentChannelId: id }),

  fetchChannels: async (serverId) => {
    const { data, error } = await supabase.from('channels').select('*').eq('server_id', serverId).order('position')
    if (!error && data) {
      set({ channels: data as Channel[] })
      // auto select first text channel if none
      if (!get().currentChannelId && data.length > 0) {
        const text = (data as Channel[]).find(c => c.type === 'text')
        set({ currentChannelId: text?.id ?? data[0].id })
      }
    }
  },

  createChannel: async (serverId, name, type) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('channels').insert({ server_id: serverId, name, type, created_by: user.id })
    if (error) console.error(error)
    else await get().fetchChannels(serverId)
  },

  fetchMembers: async (serverId) => {
    const { data, error } = await supabase.from('server_members').select('*, profile:profiles(*)').eq('server_id', serverId)
    if (!error && data) set({ members: (data as any).map((r:any)=> ({ ...r, profile: r.profile })) as ServerMember[] })
  },
}))
